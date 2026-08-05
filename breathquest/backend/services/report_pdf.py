"""
services/report_pdf.py — ICF-style progress report, rendered to PDF.

Pulls from the same aggregates the dashboard already computes (PatientProgress,
weekly summary, goals, assignments) rather than re-querying the DB, so the PDF
can never drift out of sync with what the therapist sees on screen.
"""

from datetime import datetime, timezone

# reportlab is imported lazily (inside build_patient_report_pdf) rather than
# at module load time. If reportlab is ever missing or fails to install, this
# module can still be imported cleanly — only the PDF-export endpoint itself
# fails, not the entire app's startup. See PDF_EXPORT_UNAVAILABLE below.
_styles = _h1 = _h2 = _body = _small = None
PDF_EXPORT_UNAVAILABLE = None  # set to the ImportError string if unavailable


def _init_styles():
    global _styles, _h1, _h2, _body, _small, PDF_EXPORT_UNAVAILABLE
    if _styles is not None or PDF_EXPORT_UNAVAILABLE is not None:
        return
    try:
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        _styles = getSampleStyleSheet()
        _h1 = _styles["Title"]
        _h2 = ParagraphStyle("h2", parent=_styles["Heading2"], spaceBefore=14, spaceAfter=6)
        _body = _styles["Normal"]
        _small = ParagraphStyle("small", parent=_styles["Normal"], fontSize=9, textColor=colors.grey)
    except ImportError as e:
        PDF_EXPORT_UNAVAILABLE = str(e)


def _fmt_date(d):
    if not d:
        return "—"
    if isinstance(d, str):
        return d[:10]
    return d.strftime("%b %d, %Y")


# ICF-style qualifier scale (0 = no difficulty ... 4 = complete difficulty),
# collapsed to 4 rule-based bands driven by in-app performance data. This is
# NOT a clinical severity diagnosis — it's a practice-performance indicator a
# therapist reads alongside their own assessment, and the report says so
# explicitly wherever it appears.
def _severity_band(rate):
    """rate: 0..1 or None. Returns (label, ICF-style qualifier)."""
    if rate is None:
        return ("Not yet assessed", "—")
    if rate >= 0.80:
        return ("No/mild difficulty", "0–1")
    if rate >= 0.60:
        return ("Mild difficulty", "1")
    if rate >= 0.40:
        return ("Moderate difficulty", "2")
    return ("Severe difficulty", "3")


def build_patient_report_pdf(
    *, patient, progress, weekly_summary, goals, assignments, therapist, output_path: str,
) -> str:
    """
    patient:         Patient ORM object
    progress:        PatientProgress (pydantic) — from get_patient_progress
    weekly_summary:  WeeklySummaryOut (pydantic) — from generate_weekly_summary
    goals:           list[GoalOut]
    assignments:     list[AssignmentOut]
    therapist:       Therapist ORM object
    output_path:     where to write the PDF
    """
    _init_styles()
    if PDF_EXPORT_UNAVAILABLE:
        raise RuntimeError(f"PDF export is temporarily unavailable: {PDF_EXPORT_UNAVAILABLE}")

    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    )

    doc = SimpleDocTemplate(
        output_path, pagesize=letter,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
    )
    story = []

    # --- Header ---
    story.append(Paragraph(f"Progress Report — {patient.first_name}", _h1))
    story.append(Paragraph(
        f"Prepared by {therapist.full_name}"
        + (f", {therapist.clinic_name}" if therapist.clinic_name else "")
        + f" &nbsp;•&nbsp; Generated {_fmt_date(datetime.now(timezone.utc))}",
        _small,
    ))
    story.append(Spacer(1, 16))

    # --- Client info (ICF: personal/contextual factors) ---
    story.append(Paragraph("Client Information", _h2))
    info_rows = [
        ["Name", patient.first_name],
        ["Age", str(patient.age) if patient.age is not None else "—"],
        ["Diagnosis / notes", patient.diagnosis_notes or "—"],
    ]
    t = Table(info_rows, colWidths=[1.5 * inch, 4.5 * inch])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)

    # --- Body functions / activity summary (ICF: body functions + activity) ---
    story.append(Paragraph("Activity Summary", _h2))
    summary_rows = [
        ["Total sessions", str(progress.total_sessions)],
        ["Stars earned", f"{progress.total_stars} / {progress.max_possible_stars}"],
        ["Completion rate", f"{progress.completion_rate * 100:.0f}%"],
        ["Avg. breath strength", f"{progress.avg_breath_strength:.2f}" if progress.avg_breath_strength else "—"],
        ["Improvement trend (last 5 vs prior 5)", (
            f"{'+' if progress.improvement_trend >= 0 else ''}{progress.improvement_trend}"
            if progress.improvement_trend is not None else "Not enough data yet"
        )],
    ]
    t = Table(summary_rows, colWidths=[2.7 * inch, 3.3 * inch])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.lightgrey),
    ]))
    story.append(t)

    # --- Severity indicators (ICF: body function qualifiers) ---
    story.append(Paragraph("Practice Performance Severity Indicators", _h2))
    story.append(Paragraph(
        "Rule-based, derived from in-app practice data only — not a clinical "
        "severity diagnosis. Use alongside your own standardized assessment.",
        _small,
    ))
    story.append(Spacer(1, 4))

    goal_rate = (
        sum(1 for g in goals if g.achieved) / len(goals) if goals else None
    )
    severity_rows = [
        ["Domain", "Performance", "Severity band", "ICF qualifier"],
    ]
    for domain, rate in [
        ("BreathQuest (completion rate)", progress.completion_rate),
        ("Goals (achievement rate)", goal_rate),
    ]:
        label, qualifier = _severity_band(rate)
        severity_rows.append([
            domain,
            f"{rate * 100:.0f}%" if rate is not None else "No data",
            label,
            qualifier,
        ])
    t = Table(severity_rows, colWidths=[2.3 * inch, 1.3 * inch, 1.6 * inch, 1.3 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF2FF")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.lightgrey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t)

    # --- Per-level breakdown ---
    story.append(Paragraph("Per-Level Breakdown", _h2))
    level_header = ["Level", "Attempts", "Best ★", "Avg ★", "Avg Breath", "Last Played"]
    level_rows = [level_header] + [
        [
            lp.level_name, str(lp.attempts), str(lp.best_stars), f"{lp.avg_stars:.2f}",
            f"{lp.avg_breath_strength:.2f}" if lp.avg_breath_strength else "—",
            _fmt_date(lp.last_played),
        ]
        for lp in progress.level_progress
    ]
    t = Table(level_rows, colWidths=[1.5 * inch, 0.8 * inch, 0.6 * inch, 0.6 * inch, 0.9 * inch, 1.1 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF2FF")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.lightgrey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t)

    # --- Goals (ICF: activity/participation targets) ---
    story.append(Paragraph("Goals", _h2))
    if goals:
        goal_header = ["Target", "Baseline", "Current", "Target Value", "Target Date", "Status"]
        goal_rows = [goal_header] + [
            [
                g.target_metric,
                f"{g.baseline_value:.2f}" if g.baseline_value is not None else "—",
                f"{g.current_value:.2f}" if g.current_value is not None else "—",
                f"{g.target_value:.2f}",
                _fmt_date(g.target_date),
                "Achieved" if g.achieved else "In progress",
            ]
            for g in goals
        ]
        t = Table(goal_rows, colWidths=[1.4 * inch, 0.8 * inch, 0.8 * inch, 0.9 * inch, 1.0 * inch, 0.9 * inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF2FF")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.lightgrey),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("No goals set yet.", _body))

    # --- Assignments / homework ---
    story.append(Paragraph("Homework Assignments", _h2))
    if assignments:
        a_header = ["Title", "Game", "Status", "Due"]
        a_rows = [a_header] + [
            [a.title, a.game, a.status.value if hasattr(a.status, "value") else a.status, _fmt_date(a.due_at)]
            for a in assignments[:10]
        ]
        t = Table(a_rows, colWidths=[2.2 * inch, 1.2 * inch, 1.2 * inch, 1.2 * inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF2FF")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.lightgrey),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("No assignments yet.", _body))

    # --- Weekly narrative (most recent week, plain-language) ---
    story.append(PageBreak())
    story.append(Paragraph("This Week — Narrative Summary", _h2))
    story.append(Paragraph(weekly_summary.narrative, _body))
    story.append(Spacer(1, 8))
    if weekly_summary.highlights:
        for h in weekly_summary.highlights:
            story.append(Paragraph(f"• {h}", _body))

    doc.build(story)
    return output_path
