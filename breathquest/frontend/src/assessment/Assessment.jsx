import { useState, useRef, useEffect } from "react";
import { MouthDiagram } from "../MouthDiagram";
import { ALPHABET_SOUNDS, KEYBOARD_ROWS, LETTER_NAME_GUIDES } from "../alphabetData";
import "./Assessment.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const INDIAN_LANGUAGES = [
  { code: "en-IN", name: "English (India)", voiceLang: "en-IN", translationKey: "english", listenText: "Listen", slowText: "Say it slowly" },
  { code: "hi-IN", name: "Hindi", voiceLang: "hi-IN", translationKey: "hindi", listenText: "सुनो", slowText: "धीरे बोलो" },
  { code: "ta-IN", name: "Tamil", voiceLang: "ta-IN", translationKey: "tamil", listenText: "கேளுங்கள்", slowText: "மெதுவாகச் சொல்லுங்கள்" },
  { code: "te-IN", name: "Telugu", voiceLang: "te-IN", translationKey: "telugu", listenText: "వినండి", slowText: "నెమ్మదిగా చెప్పండి" },
  { code: "kn-IN", name: "Kannada", voiceLang: "kn-IN", translationKey: "kannada", listenText: "ಕೇಳಿ", slowText: "ನಿಧಾನವಾಗಿ ಹೇಳಿ" },
  { code: "ml-IN", name: "Malayalam", voiceLang: "ml-IN", translationKey: "malayalam", listenText: "കേൾക്കുക", slowText: "പതുക്കെ പറയുക" },
  { code: "bn-IN", name: "Bengali", voiceLang: "bn-IN", translationKey: "bengali", listenText: "শুনুন", slowText: "আস্তে বলুন" },
  { code: "mr-IN", name: "Marathi", voiceLang: "mr-IN", translationKey: "marathi", listenText: "ऐका", slowText: "संथ बोला" },
];

function speakIndianEnglish(text, slow = false, language = "en-IN") {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = slow ? 0.62 : 0.9;
  utterance.pitch = 1;

  const voices = window.speechSynthesis.getVoices();
  const indianVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith(language.toLowerCase()));
  const hindiVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("hi-in"));
  const englishVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("en"));
  utterance.voice = indianVoice || hindiVoice || englishVoice || null;
  window.speechSynthesis.speak(utterance);
}

// Map failed phonemes to keyboard letters
function mapPhonemeToLetter(phoneme) {
  if (!phoneme) return null;
  const p = phoneme.toUpperCase().replace(/[0-9]/g, ""); // Strip stress digits
  const mapping = {
    "AA": "A", "AE": "A", "AH": "A", "AO": "O", "AW": "A", "AY": "A",
    "EH": "E", "ER": "R", "EY": "A",
    "IH": "I", "IY": "E",
    "OW": "O", "OY": "O",
    "UH": "U", "UW": "U",
    "B": "B",
    "CH": "C", "SH": "S", "JH": "J", "ZH": "S",
    "D": "D", "DH": "D",
    "F": "F",
    "G": "G",
    "HH": "H",
    "K": "K",
    "L": "L",
    "M": "M",
    "N": "N", "NG": "N",
    "P": "P",
    "R": "R",
    "S": "S", "Z": "Z",
    "T": "T", "TH": "T",
    "V": "V",
    "W": "W",
    "Y": "Y"
  };
  return mapping[p] || null;
}

export default function Assessment() {
  const [section, setSection] = useState("auth-selection");
  const [word, setWord] = useState(null);
  const [wordLoading, setWordLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  const [letter, setLetter] = useState("A");
  const [selectedLanguage, setSelectedLanguage] = useState("en-IN");

  // Login Form States
  const [loginName, setLoginName] = useState("");
  const [loginDOB, setLoginDOB] = useState("");
  const [loginError, setLoginError] = useState("");

  // Patient Details Form States
  const [patientName, setPatientName] = useState("");
  const [patientDOB, setPatientDOB] = useState("");
  const [parentName, setParentName] = useState("");
  const [therapistName, setTherapistName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [isDiagnosed, setIsDiagnosed] = useState("");
  const [diagnosisDetails, setDiagnosisDetails] = useState("");
  const [otherInfo, setOtherInfo] = useState("");
  const [childPhoto, setChildPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [currentPatientId, setCurrentPatientId] = useState(null);

  // Validation States
  const [contactNumberError, setContactNumberError] = useState("");
  const [emailAddressError, setEmailAddressError] = useState("");

  // Validation Functions
  const validateContactNumber = (number) => {
    if (!number) return "";
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(number)) {
      return "Mobile number must be exactly 10 digits";
    }
    return "";
  };

  const validateEmailAddress = (email) => {
    if (!email) return "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return "Please enter a valid email address";
    }
    return "";
  };

  // Function to convert file to base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result.split(',')[1]; // Remove data URL prefix
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Function to login existing patient
  const loginPatient = async () => {
    try {
      console.log("Attempting login with:", { loginName, loginDOB, API_URL });
      setLoginError("");
      
      if (!loginName || !loginDOB) {
        setLoginError("Please enter both name and date of birth");
        return;
      }
      
      const response = await fetch(`${API_URL}/patients/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: loginName,
          date_of_birth: loginDOB
        })
      });

      console.log("Login response status:", response.status);
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Login failed:", errorData);
        throw new Error(errorData.detail || 'Login failed');
      }

      const result = await response.json();
      console.log("Login successful:", result);
      setCurrentPatientId(result.id);
      setPatientName(result.name);
      setPatientDOB(result.date_of_birth ? result.date_of_birth.split('T')[0] : "");
      setParentName(result.parent_name || "");
      setContactNumber(result.parent_contact || "");
      setEmailAddress(result.email || "");
      setSection("home");
      console.log("Redirected to home section");
      return result;
    } catch (error) {
      console.error('Error logging in patient:', error);
      setLoginError(error.message || "Patient not found. Please check name and date of birth.");
      throw error;
    }
  };

  // Function to save patient details
  const savePatientDetails = async () => {
    try {
      console.log("Saving patient details...", { patientName, patientDOB, parentName, contactNumber, emailAddress });
      const patientData = {
        name: patientName,
        age: patientDOB ? new Date().getFullYear() - new Date(patientDOB).getFullYear() : null,
        date_of_birth: patientDOB || null,
        language: selectedLanguage.split('-')[0],
        gender: "other",
        diagnosis: isDiagnosed === "yes" ? diagnosisDetails : "General Speech",
        therapist_name: therapistName.trim() || null,
        parent_name: parentName,
        parent_contact: contactNumber,
        email: emailAddress
      };

      let response;
      if (currentPatientId) {
        // Update existing patient (not currently supported in backend)
        console.log("Update not supported, skipping");
        return { id: currentPatientId };
      } else {
        // Create new patient
        console.log("Creating new patient with API:", API_URL);
        response = await fetch(`${API_URL}/patients/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patientData)
        });
      }

      console.log("Response status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to save patient details:", errorText);
        throw new Error('Failed to save patient details');
      }

      const result = await response.json();
      console.log("Patient saved successfully:", result);
      setCurrentPatientId(result.id);
      return result;
    } catch (error) {
      console.error('Error saving patient details:', error);
      throw error;
    }
  };

  // Function to load patient details
  const loadPatientDetails = async (patientId) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const response = await fetch(`${API_URL}/patients/${patientId}`);
      
      if (!response.ok) {
        throw new Error('Failed to load patient details');
      }

      const patient = await response.json();
      
      // Set form fields
      setPatientName(patient.name || "");
      setPatientDOB(patient.date_of_birth ? patient.date_of_birth.split('T')[0] : "");
      setParentName(patient.parent_name || "");
      setContactNumber(patient.parent_contact || "");
      setEmailAddress(patient.email || "");
      setIsDiagnosed(patient.diagnosis ? "yes" : "no");
      setDiagnosisDetails(patient.diagnosis || "");
      setOtherInfo("");
      setCurrentPatientId(patient.id);
      
      // Handle photo
      if (patient.photo_data) {
        setPhotoPreview(`data:${patient.photo_content_type || 'image/jpeg'};base64,${patient.photo_data}`);
      }
      
    } catch (error) {
      console.error('Error loading patient details:', error);
      throw error;
    }
  };

  // Audio Recording & Analysis States
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Custom Audio Recording for Word Pronunciation
  const [customRecording, setCustomRecording] = useState(false);
  const [customAudioBlob, setCustomAudioBlob] = useState(null);
  const [customAudioUrl, setCustomAudioUrl] = useState(null);
  const [audioExists, setAudioExists] = useState(false);
  const [checkingAudio, setCheckingAudio] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const customMediaRecorderRef = useRef(null);
  const customChunksRef = useRef([]);

  const selectedSound = ALPHABET_SOUNDS[letter];
  const letterGuide = LETTER_NAME_GUIDES[selectedSound.guide];

  async function loadRandomWord() {
    console.log("Loading random word...");
    setSection("word");
    setWordLoading(true);
    setImageLoading(true);
    setError("");
    setAudioBlob(null);
    setAudioUrl(null);
    setAnalysisResult(null);
    setCustomAudioBlob(null);
    setCustomAudioUrl(null);
    setAudioExists(false);

    try {
      console.log("Fetching random word from:", `${API_URL}/assessment/words/random`);
      const response = await fetch(`${API_URL}/assessment/words/random`);
      console.log("Random word response status:", response.status);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load a word");
      console.log("Random word loaded:", data);
      setWord(data);
    } catch (requestError) {
      console.error("Error loading random word:", requestError);
      setWord(null);
      setImageLoading(false);
      setError(requestError.message);
    } finally {
      setWordLoading(false);
    }
  }

  // Check if audio exists for current word and language
  const checkAudioExistence = async (wordKey, languageCode) => {
    if (!wordKey || !languageCode) return;
    
    setCheckingAudio(true);
    try {
      const langCode = languageCode.split('-')[0]; // Extract 'en' from 'en-IN'
      const response = await fetch(`${API_URL}/assessment/audio/${wordKey}/${langCode}/exists`);
      const data = await response.json();
      if (response.ok) {
        setAudioExists(data.exists);
      }
    } catch (err) {
      console.error("Failed to check audio existence:", err);
      setAudioExists(false);
    } finally {
      setCheckingAudio(false);
    }
  };

  // Check audio when word or language changes
  useEffect(() => {
    if (word && selectedLanguage) {
      const langCode = selectedLanguage.split('-')[0];
      checkAudioExistence(word.word, langCode);
    }
  }, [word, selectedLanguage]);

  // Custom audio recording functions
  const startCustomRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      customChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          customChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(customChunksRef.current, { type: "audio/wav" });
        setCustomAudioBlob(blob);
        setCustomAudioUrl(URL.createObjectURL(blob));
      };

      customMediaRecorderRef.current = recorder;
      recorder.start();
      setCustomRecording(true);
    } catch (err) {
      console.error(err);
      alert("Microphone access denied");
    }
  };

  const stopCustomRecording = () => {
    if (!customMediaRecorderRef.current) return;
    customMediaRecorderRef.current.stop();
    setCustomRecording(false);
  };

  // Auto-upload when recording stops
  useEffect(() => {
    if (customAudioBlob && !customRecording) {
      uploadCustomAudio();
    }
  }, [customAudioBlob, customRecording]);

  const uploadCustomAudio = async () => {
    if (!customAudioBlob || !word) {
      return;
    }

    setUploading(true);
    try {
      const langCode = selectedLanguage.split('-')[0];
      const formData = new FormData();
      formData.append("file", customAudioBlob, `${word.word}_${langCode}.wav`);

      const response = await fetch(`${API_URL}/assessment/audio/${word.word}/${langCode}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Upload failed");

      setCustomAudioBlob(null);
      setCustomAudioUrl(null);
      setAudioExists(true);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const playCachedAudio = async (slow = false) => {
    if (!word || !selectedLanguage) return;
    
    const langCode = selectedLanguage.split('-')[0];
    
    if (!audioExists) {
      alert(`No audio found for ${word.word} in ${INDIAN_LANGUAGES.find(l => l.code === selectedLanguage)?.name}. Please record it first.`);
      return;
    }

    setPlayingAudio(true);
    try {
      const response = await fetch(`${API_URL}/assessment/audio/${word.word}/${langCode}`);
      if (!response.ok) {
        throw new Error("Failed to fetch audio");
      }
      
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      if (slow) {
        audio.playbackRate = 0.7;
      }
      
      audio.onended = () => {
        setPlayingAudio(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.onerror = () => {
        setPlayingAudio(false);
        URL.revokeObjectURL(audioUrl);
        alert("Failed to play audio");
      };
      
      audio.play();
    } catch (err) {
      console.error(err);
      setPlayingAudio(false);
      alert("Failed to play audio: " + err.message);
    }
  };

  function openAlphabet() {
    setSection("alphabet");
    setError("");
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/wav" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      console.error(err);
      alert("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    setRecording(false);
  };

  const analyzeSpeech = async () => {
    if (!audioBlob || !word) {
      alert("Please record audio first");
      return;
    }
    setLoading(true);
    setError("");
    setAnalysisResult(null);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.wav");
      formData.append("patient_name", patientName || "Student");
      formData.append("patient_id", currentPatientId || "");
      formData.append("target_word", word.word);
      // Add language parameter
      const langCode = selectedLanguage.split('-')[0];
      formData.append("language", langCode);
      
      console.log("Sending assessment request with:", {
        patient_name: patientName || "Student",
        patient_id: currentPatientId || "",
        target_word: word.word,
        language: langCode
      });
      
      const response = await fetch(`${API_URL}/assessment/analyze`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      console.log("Assessment response:", data);

      if (!response.ok || data.error || data.detail) {
        throw new Error(data.error || JSON.stringify(data.detail || data));
      }

      setAnalysisResult(data);
    } catch (err) {
      console.error(err);
      setError("Speech analysis failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Find incorrect phonemes and link them to Alphabet cards
  const getLinkableLetters = () => {
    if (!analysisResult || !analysisResult.phoneme_matches) return [];
    const incorrectPhonemes = analysisResult.phoneme_matches
      .filter(m => !m.correct)
      .map(m => m.expected);
    const uniqueIncorrect = [...new Set(incorrectPhonemes)];
    return uniqueIncorrect
      .map(p => ({ phoneme: p, letter: mapPhonemeToLetter(p) }))
      .filter(item => item.letter && ALPHABET_SOUNDS[item.letter]);
  };

  const linkableLetters = getLinkableLetters();

  return (
    <main className="assessment-page">
      {section === "auth-selection" ? (
        <div className="assessment-heading" style={{ textAlign: "center" }}>
          <div>
            <span className="assessment-eyebrow">👋 Welcome to Assessment 👋</span>
            <h1 style={{ margin: "0 0 4px 0", color: "#7c3aed", fontSize: "2.2rem", fontWeight: 900 }}>Get Started</h1>
            <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>Are you a new student or returning?</p>
          </div>
        </div>
      ) : section === "patient-details" ? (
        <div className="assessment-heading" style={{ textAlign: "center" }}>
          <div>
            <span className="assessment-eyebrow">🌟 Child's Details 🌟</span>
            <h1 style={{ margin: "0 0 4px 0", color: "#7c3aed", fontSize: "2.2rem", fontWeight: 900, animation: "bounce 2s infinite" }}>Child's Details</h1>
            <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>Please fill in the following information to begin the assessment.</p>
          </div>
          <button
            onClick={() => setSection("auth-selection")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "2px solid #a855f7",
              background: "white",
              color: "#7c3aed",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "#faf5ff";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "white";
            }}
          >
            ← Back
          </button>
        </div>
      ) : (
        <div className="assessment-heading">
          <div>
            <span className="assessment-eyebrow">Learn · Listen · Explore</span>
            <h1>Assessment Playground</h1>
            <p>Choose a word challenge or explore how every alphabet sound is formed.</p>
          </div>
          {section !== "home" && (
            <button className="assessment-back" onClick={() => setSection("home")}>
              ← All activities
            </button>
          )}
        </div>
      )}

      {section === "auth-selection" && (
        <div className="assessment-choice-grid">
          <button className="assessment-choice word-choice" onClick={() => setSection("patient-details")}>
            <span className="choice-icon">🆕</span>
            <span className="choice-copy">
              <strong>Register New Student</strong>
              <small>Fill in child details to create a new profile.</small>
            </span>
            <span className="choice-arrow">→</span>
          </button>

          <button className="assessment-choice alphabet-choice" onClick={() => setSection("login")}>
            <span className="choice-icon">🔑</span>
            <span className="choice-copy">
              <strong>Login Existing Student</strong>
              <small>Enter name and date of birth to continue.</small>
            </span>
            <span className="choice-arrow">→</span>
          </button>
        </div>
      )}

      {section === "login" && (
        <section className="word-assessment-card" style={{ padding: "24px", maxWidth: "500px", margin: "0 auto", background: "linear-gradient(135deg, #fff9f0 0%, #fffbeb 50%, #fdf4ff 100%)" }}>
          <div style={{ marginBottom: "20px", textAlign: "center" }}>
            <h2 style={{ margin: "0 0 8px 0", color: "#7c3aed", fontSize: "1.5rem", fontWeight: 900 }}>Student Login</h2>
            <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>Enter your details to continue</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: 700, color: "#4b5563", fontSize: "14px" }}>
                Child's Name
              </label>
              <input
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="Enter child's name"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "2px solid #e5e7eb",
                  fontSize: "15px",
                  fontWeight: 600,
                  transition: "all 0.2s ease"
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#a855f7";
                  e.target.style.boxShadow = "0 0 0 3px rgba(168, 85, 247, 0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#e5e7eb";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: 700, color: "#4b5563", fontSize: "14px" }}>
                Date of Birth
              </label>
              <input
                type="date"
                value={loginDOB}
                onChange={(e) => setLoginDOB(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "2px solid #e5e7eb",
                  fontSize: "15px",
                  fontWeight: 600,
                  transition: "all 0.2s ease"
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#a855f7";
                  e.target.style.boxShadow = "0 0 0 3px rgba(168, 85, 247, 0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#e5e7eb";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {loginError && (
              <div style={{ padding: "12px", background: "#fef2f2", borderRadius: "8px", border: "1px solid #fecaca", color: "#991b1b", fontSize: "14px", fontWeight: 600 }}>
                {loginError}
              </div>
            )}

            <button
              onClick={loginPatient}
              disabled={!loginName || !loginDOB}
              style={{
                padding: "14px 24px",
                borderRadius: "12px",
                border: "none",
                background: !loginName || !loginDOB ? "#d1d5db" : "#7c3aed",
                color: "white",
                fontSize: "16px",
                fontWeight: 800,
                cursor: !loginName || !loginDOB ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                marginTop: "8px"
              }}
              onMouseEnter={(e) => {
                if (loginName && loginDOB) {
                  e.target.style.background = "#6d28d9";
                  e.target.style.transform = "translateY(-2px)";
                }
              }}
              onMouseLeave={(e) => {
                if (loginName && loginDOB) {
                  e.target.style.background = "#7c3aed";
                  e.target.style.transform = "translateY(0)";
                }
              }}
            >
              Login
            </button>

            <button
              onClick={() => setSection("auth-selection")}
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                border: "2px solid #a855f7",
                background: "white",
                color: "#7c3aed",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#faf5ff";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "white";
              }}
            >
              ← Back
            </button>
          </div>
        </section>
      )}

      {section === "home" && (
        <div className="assessment-choice-grid">
          <button className="assessment-choice word-choice" onClick={loadRandomWord}>
            <span className="choice-icon">🖼️</span>
            <span className="choice-copy">
              <strong>Say a Word</strong>
              <small>See it, hear it in an Indian accent, then say it aloud.</small>
            </span>
            <span className="choice-arrow">→</span>
          </button>

          <button className="assessment-choice alphabet-choice" onClick={openAlphabet}>
            <span className="choice-icon">⌨️</span>
            <span className="choice-copy">
              <strong>Alphabet</strong>
              <small>Explore tongue, mouth, airflow and stress positions.</small>
            </span>
            <span className="choice-arrow">→</span>
          </button>
        </div>
      )}

      {section === "patient-details" && (
        <div style={{ marginTop: "0", display: "grid", gap: "8px", maxWidth: "1200px", margin: "0 auto" }}>
          <style>{`
            @keyframes floaty {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-5px); }
            }
            @keyframes rainbowBorder {
              0% { border-color: #f97316; }
              25% { border-color: #eab308; }
              50% { border-color: #22c55e; }
              75% { border-color: #3b82f6; }
              100% { border-color: #a855f7; }
            }
          `}</style>

          {/* Photo Upload - Passport Size */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <section style={{ background: "linear-gradient(90deg, #fff7ff 0%, #f7fbff 100%)", borderRadius: "16px", padding: "10px", boxShadow: "0 8px 22px rgba(132, 94, 194, 0.12)", width: "fit-content" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", justifyContent: "center" }}>
                <span style={{ fontSize: "18px" }}>📷</span>
                <h2 style={{ margin: 0, color: "#7c3aed", fontSize: "16px" }}>Child's Photo (Passport Size)</h2>
              </div>
              <div
                style={{
                  width: "160px",
                  height: "200px",
                  border: "3px dashed #a855f7",
                  borderRadius: "16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  background: photoPreview ? "#fff" : "linear-gradient(135deg, #faf5ff 0%, #fce7f3 100%)",
                  position: "relative",
                  overflow: "hidden",
                  animation: "rainbowBorder 3s infinite",
                  transition: "all 0.3s ease"
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = "scale(1.02)";
                  e.target.style.boxShadow = "0 8px 20px rgba(168, 85, 247, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = "scale(1)";
                  e.target.style.boxShadow = "none";
                }}
                onClick={() => document.getElementById('photo-upload').click()}
              >
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Child's photo"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ textAlign: "center", padding: "15px" }}>
                    <span style={{ fontSize: "36px", marginBottom: "8px", display: "block", animation: "floaty 2s infinite" }}>📷</span>
                    <span style={{ fontSize: "12px", color: "#7c3aed", fontWeight: 700 }}>Click to upload</span>
                    <span style={{ fontSize: "10px", color: "#ec4899", display: "block", marginTop: "4px", fontWeight: 600 }}>Passport size</span>
                  </div>
                )}
                <input
                  type="file"
                  id="photo-upload"
                  accept="image/jpeg,image/png"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setChildPhoto(file);
                      setPhotoPreview(URL.createObjectURL(file));
                    }
                  }}
                />
              </div>
              {childPhoto && (
                <button
                  onClick={() => {
                    setChildPhoto(null);
                    setPhotoPreview(null);
                  }}
                  style={{
                    marginTop: "6px",
                    padding: "6px 12px",
                    border: "none",
                    borderRadius: "6px",
                    background: "#ef4444",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "11px",
                    cursor: "pointer",
                    width: "100%"
                  }}
                >
                  Remove Photo
                </button>
              )}
            </section>
          </div>

          {/* Child Name - Full Width */}
          <section style={{ background: "linear-gradient(90deg, #fff7ff 0%, #f7fbff 100%)", borderRadius: "16px", padding: "10px", boxShadow: "0 8px 22px rgba(132, 94, 194, 0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "18px" }}>👶</span>
              <h2 style={{ margin: 0, color: "#7c3aed", fontSize: "16px" }}>Child's Name</h2>
            </div>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Enter child's name"
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "12px",
                border: "2px solid #e9d5ff",
                fontSize: "14px",
                outline: "none",
                background: "#fff",
                fontWeight: 600
              }}
            />
          </section>

          {/* Date of Birth - Full Width */}
          <section style={{ background: "linear-gradient(90deg, #f7fee7 0%, #f7fbff 100%)", borderRadius: "16px", padding: "10px", boxShadow: "0 8px 22px rgba(132, 94, 194, 0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "18px" }}>🎂</span>
              <h2 style={{ margin: 0, color: "#65a30d", fontSize: "16px" }}>Date of Birth</h2>
            </div>
            <input
              type="date"
              value={patientDOB}
              onChange={(e) => setPatientDOB(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "12px",
                border: "2px solid #d9f99d",
                fontSize: "14px",
                outline: "none",
                background: "#fff",
                fontWeight: 600
              }}
            />
          </section>

          {/* Parent Name - Full Width */}
          <section style={{ background: "linear-gradient(90deg, #fff7ff 0%, #f7fbff 100%)", borderRadius: "16px", padding: "10px", boxShadow: "0 8px 22px rgba(132, 94, 194, 0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "18px" }}>👨‍👩‍👧</span>
              <h2 style={{ margin: 0, color: "#7c3aed", fontSize: "16px" }}>Parent/Guardian Name</h2>
            </div>
            <input
              type="text"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Enter parent or guardian name"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "12px",
                border: "2px solid #e9d5ff",
                fontSize: "14px",
                outline: "none",
                background: "#fff",
                fontWeight: 600
              }}
            />
          </section>

          {/* Therapist Name - Full Width */}
          <section style={{ background: "linear-gradient(90deg, #eefbff 0%, #f7fbff 100%)", borderRadius: "16px", padding: "10px", boxShadow: "0 8px 22px rgba(59, 130, 246, 0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "18px" }}>Therapist</span>
              <h2 style={{ margin: 0, color: "#7c3aed", fontSize: "16px" }}>Therapist Name</h2>
            </div>
            <input
              type="text"
              value={therapistName}
              onChange={(e) => setTherapistName(e.target.value)}
              placeholder="Enter therapist's name"
              style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "2px solid #bfdbfe", fontSize: "14px", outline: "none", background: "#fff", fontWeight: 600 }}
            />
          </section>
          {/* Mobile and Email - Two Columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <section style={{ background: "linear-gradient(90deg, #f7fee7 0%, #f7fbff 100%)", borderRadius: "16px", padding: "10px", boxShadow: "0 8px 22px rgba(132, 94, 194, 0.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontSize: "18px" }}>📱</span>
                <h2 style={{ margin: 0, color: "#65a30d", fontSize: "16px" }}>Mobile Number</h2>
              </div>
              <input
                type="tel"
                value={contactNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                  setContactNumber(value);
                  setContactNumberError(validateContactNumber(value));
                }}
                placeholder="Enter mobile number"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "12px",
                  border: contactNumberError ? "2px solid #ef4444" : "2px solid #d9f99d",
                  fontSize: "14px",
                  outline: "none",
                  background: "#fff",
                  fontWeight: 600
                }}
              />
              {contactNumberError && (
                <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px", fontWeight: 600 }}>
                  {contactNumberError}
                </div>
              )}
            </section>

            <section style={{ background: "linear-gradient(90deg, #fff7ff 0%, #f7fbff 100%)", borderRadius: "16px", padding: "10px", boxShadow: "0 8px 22px rgba(132, 94, 194, 0.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontSize: "18px" }}>📧</span>
                <h2 style={{ margin: 0, color: "#7c3aed", fontSize: "16px" }}>Email Address</h2>
              </div>
              <input
                type="email"
                value={emailAddress}
                onChange={(e) => {
                  setEmailAddress(e.target.value);
                  setEmailAddressError(validateEmailAddress(e.target.value));
                }}
                placeholder="Enter email address"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "12px",
                  border: emailAddressError ? "2px solid #ef4444" : "2px solid #e9d5ff",
                  fontSize: "14px",
                  outline: "none",
                  background: "#fff",
                  fontWeight: 600
                }}
              />
              {emailAddressError && (
                <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px", fontWeight: 600 }}>
                  {emailAddressError}
                </div>
              )}
            </section>
          </div>

          {/* Diagnosis Section - Full Width */}
          <section style={{ background: "linear-gradient(90deg, #fff7ff 0%, #f7fbff 100%)", borderRadius: "16px", padding: "10px", boxShadow: "0 8px 22px rgba(132, 94, 194, 0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "18px" }}>🏥</span>
              <h2 style={{ margin: 0, color: "#7c3aed", fontSize: "16px" }}>Has the child been diagnosed with a speech or language disorder?</h2>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "8px 12px", borderRadius: "12px", border: "2px solid #f97316", background: isDiagnosed === "yes" ? "#fef3c7" : "#fff", transition: "all 0.3s ease" }}>
                <input
                  type="radio"
                  name="diagnosed"
                  value="yes"
                  checked={isDiagnosed === "yes"}
                  onChange={(e) => setIsDiagnosed(e.target.value)}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ fontSize: "13px", color: "#374151", fontWeight: 600 }}>Yes</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "8px 12px", borderRadius: "12px", border: "2px solid #22c55e", background: isDiagnosed === "no" ? "#dcfce7" : "#fff", transition: "all 0.3s ease" }}>
                <input
                  type="radio"
                  name="diagnosed"
                  value="no"
                  checked={isDiagnosed === "no"}
                  onChange={(e) => setIsDiagnosed(e.target.value)}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ fontSize: "13px", color: "#374151", fontWeight: 600 }}>No</span>
              </label>
            </div>
          </section>

          {isDiagnosed === "yes" && (
            <section style={{ background: "linear-gradient(90deg, #f7fee7 0%, #f7fbff 100%)", borderRadius: "16px", padding: "10px", boxShadow: "0 8px 22px rgba(132, 94, 194, 0.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontSize: "18px" }}>📋</span>
                <h2 style={{ margin: 0, color: "#65a30d", fontSize: "16px" }}>Diagnosis Details</h2>
              </div>
              <textarea
                value={diagnosisDetails}
                onChange={(e) => setDiagnosisDetails(e.target.value)}
                placeholder="Please provide diagnosis details"
                rows="2"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "12px",
                  border: "2px solid #d9f99d",
                  fontSize: "14px",
                  outline: "none",
                  background: "#fff",
                  resize: "vertical",
                  transition: "all 0.3s ease",
                  fontFamily: "inherit",
                  fontWeight: 600
                }}
              />
            </section>
          )}

          {/* Other Info - Full Width */}
          <section style={{ background: "linear-gradient(90deg, #fff7ff 0%, #f7fbff 100%)", borderRadius: "16px", padding: "10px", boxShadow: "0 8px 22px rgba(132, 94, 194, 0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "18px" }}>📝</span>
              <h2 style={{ margin: 0, color: "#7c3aed", fontSize: "16px" }}>Additional Information (Optional)</h2>
            </div>
            <textarea
              value={otherInfo}
              onChange={(e) => setOtherInfo(e.target.value)}
              placeholder="Any other information you'd like to share"
              rows="2"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "12px",
                border: "2px solid #e9d5ff",
                fontSize: "14px",
                outline: "none",
                background: "#fff",
                resize: "vertical",
                transition: "all 0.3s ease",
                fontFamily: "inherit",
                fontWeight: 600
              }}
            />
          </section>

          {/* Submit Button */}
          <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "6px" }}>
            <button
              onClick={async () => {
                if (!patientName || !patientDOB) {
                  alert("Please fill in required fields (Child's Name and Date of Birth)");
                  return;
                }
                if (isDiagnosed === "yes" && !diagnosisDetails) {
                  alert("Please provide diagnosis details");
                  return;
                }
                
                // Validate contact number
                const contactError = validateContactNumber(contactNumber);
                if (contactError) {
                  setContactNumberError(contactError);
                  alert(contactError);
                  return;
                }
                
                // Validate email address
                const emailError = validateEmailAddress(emailAddress);
                if (emailError) {
                  setEmailAddressError(emailError);
                  alert(emailError);
                  return;
                }
                
                try {
                  await savePatientDetails();
                  setSection("home");
                } catch (error) {
                  alert("Failed to save patient details. Please try again.");
                  console.error(error);
                }
              }}
              style={{
                padding: "10px 32px",
                border: "none",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #f97316 0%, #eab308 50%, #22c55e 100%)",
                color: "#fff",
                fontWeight: 900,
                fontSize: "14px",
                cursor: "pointer",
                boxShadow: "0 6px 16px rgba(249, 115, 22, 0.4)",
                transition: "all 0.3s ease",
                animation: "bounce 2s infinite"
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = "translateY(-2px) scale(1.05)";
                e.target.style.boxShadow = "0 10px 24px rgba(249, 115, 22, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "translateY(0) scale(1)";
                e.target.style.boxShadow = "0 6px 16px rgba(249, 115, 22, 0.4)";
              }}
            >
              🚀 Next →
            </button>
            {/* <button
              onClick={() => {
                // Cancel doesn't save, just goes back
                setSection("home");
              }}
              style={{
                padding: "8px 20px",
                border: "3px solid #a855f7",
                borderRadius: "12px",
                background: "#fff",
                color: "#a855f7",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.3s ease"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#faf5ff";
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 6px 16px rgba(168, 85, 247, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#fff";
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "none";
              }}
            >
              ❌ Cancel
            </button> */}
          </div>
        </div>
      )}

      {section === "word" && (
        <section className="word-assessment-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
            <button
              onClick={() => setSection("patient-details")}
              style={{
                padding: "8px 16px",
                border: "2px solid #a855f7",
                borderRadius: "8px",
                background: "#faf5ff",
                color: "#7c3aed",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
                transition: "all 0.3s ease"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#a855f7";
                e.target.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#faf5ff";
                e.target.style.color = "#7c3aed";
              }}
            >
              ✏️ Edit Details
            </button>
          </div>
          {wordLoading && <div className="assessment-loader">Picking a word for you…</div>}

          {!wordLoading && error && (
            <div className="assessment-empty">
              <span>🌱</span>
              <h2>Something went wrong</h2>
              <p>{error}</p>
              <button onClick={loadRandomWord}>Try again</button>
            </div>
          )}

          {!wordLoading && word && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", width: "100%" }}>
                <div className="word-picture-wrap" style={{ flex: "1 1 300px" }}>
                  {imageLoading && <div className="picture-placeholder">Creating picture…</div>}
                  <img
                    key={word.id}
                    src={`${API_URL}${word.image_url}`}
                    alt={`Illustration of ${word.word}`}
                    className={imageLoading ? "loading" : ""}
                    style={{ width: "100%", height: "auto", maxHeight: "350px", objectFit: "contain" }}
                    onLoad={() => setImageLoading(false)}
                    onError={() => setImageLoading(false)}
                  />
                </div>
                <div className="word-practice-panel" style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "10px", padding: "12px" }}>
                  <span className="word-label">Your word is</span>
                  <h2 style={{ fontSize: "2rem", margin: 0, color: "#5b21b6" }}>{word.word}</h2>
                  <p style={{ margin: 0, fontSize: "14px" }}>Listen carefully, then try saying the word yourself.</p>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <label style={{ fontSize: "14px", fontWeight: 700, color: "#6d28d9", whiteSpace: "nowrap" }}>🌐</label>
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "2px solid #a855f7",
                        background: "#faf5ff",
                        color: "#6d28d9",
                        fontWeight: 600,
                        fontSize: "14px",
                        cursor: "pointer",
                        minWidth: "160px"
                      }}
                    >
                      {INDIAN_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </select>

                    {customRecording ? (
                      <button
                        onClick={stopCustomRecording}
                        style={{
                          padding: "10px",
                          border: "2px solid #a855f7",
                          borderRadius: "50%",
                          background: "#faf5ff",
                          color: "#6d28d9",
                          cursor: "pointer",
                          boxShadow: "0 4px 6px rgba(168,85,247,0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "48px",
                          height: "48px"
                        }}
                        title="Stop Recording"
                      >
                        ⏹
                      </button>
                    ) : (
                      <>
                        {!audioExists && (
                          <button
                            onClick={startCustomRecording}
                            disabled={uploading}
                            style={{
                              padding: "10px",
                              border: "2px solid #a855f7",
                              borderRadius: "50%",
                              background: uploading ? "#e9d5ff" : "#faf5ff",
                              color: "#6d28d9",
                              cursor: uploading ? "not-allowed" : "pointer",
                              boxShadow: "0 4px 6px rgba(168,85,247,0.1)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "48px",
                              height: "48px",
                              opacity: uploading ? 0.6 : 1
                            }}
                            title="Record Pronunciation"
                          >
                            🎤
                          </button>
                        )}

                        {audioExists && (
                          <>
                            <button
                              onClick={startCustomRecording}
                              disabled={uploading}
                              style={{
                                padding: "10px",
                                border: "2px solid #a855f7",
                                borderRadius: "50%",
                                background: uploading ? "#e9d5ff" : "#faf5ff",
                                color: "#6d28d9",
                                cursor: uploading ? "not-allowed" : "pointer",
                                boxShadow: "0 4px 6px rgba(168,85,247,0.1)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "48px",
                                height: "48px",
                                opacity: uploading ? 0.6 : 1
                              }}
                              title="Edit Pronunciation"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => playCachedAudio(false)}
                              disabled={playingAudio || checkingAudio}
                              style={{
                                padding: "10px",
                                border: "2px solid #a855f7",
                                borderRadius: "50%",
                                background: (playingAudio || checkingAudio) ? "#e9d5ff" : "#faf5ff",
                                color: "#6d28d9",
                                cursor: (playingAudio || checkingAudio) ? "not-allowed" : "pointer",
                                boxShadow: "0 4px 6px rgba(168,85,247,0.1)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "48px",
                                height: "48px",
                                opacity: (playingAudio || checkingAudio) ? 0.6 : 1
                              }}
                              title="Play Audio"
                            >
                                {playingAudio ? "⏳" : "▶️"}
                            </button>
                            <button
                              onClick={() => playCachedAudio(true)}
                              disabled={playingAudio || checkingAudio}
                              style={{
                                padding: "10px",
                                border: "2px solid #a855f7",
                                borderRadius: "50%",
                                background: (playingAudio || checkingAudio) ? "#e9d5ff" : "#faf5ff",
                                color: "#6d28d9",
                                cursor: (playingAudio || checkingAudio) ? "not-allowed" : "pointer",
                                boxShadow: "0 4px 6px rgba(168,85,247,0.1)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "48px",
                                height: "48px",
                                opacity: (playingAudio || checkingAudio) ? 0.6 : 1
                              }}
                              title="Play Slow"
                            >
                                🐢
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div style={{ borderTop: "1px solid #eee", marginTop: "12px", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <h4 style={{ margin: 0, color: "#6d28d9", fontSize: "15px" }}>🎙️ Try Pronouncing It:</h4>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      {!recording ? (
                        <button
                          onClick={startRecording}
                          style={{
                            padding: "10px 18px",
                            border: "none",
                            borderRadius: "999px",
                            background: "linear-gradient(90deg, #f97316, #fb7185)",
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: "14px",
                            cursor: "pointer",
                            boxShadow: "0 4px 10px rgba(249,115,22,0.2)"
                          }}
                        >
                          🎤 Record
                        </button>
                      ) : (
                        <button
                          onClick={stopRecording}
                          style={{
                            padding: "10px 18px",
                            border: "none",
                            borderRadius: "999px",
                            background: "linear-gradient(90deg, #ef4444, #f97316)",
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: "14px",
                            cursor: "pointer",
                            boxShadow: "0 4px 10px rgba(239,68,68,0.2)"
                          }}
                        >
                          ⏹ Stop
                        </button>
                      )}

                      <button
                        onClick={analyzeSpeech}
                        disabled={loading || !audioBlob}
                        style={{
                          padding: "10px 18px",
                          border: "none",
                          borderRadius: "999px",
                          background: loading
                            ? "#cbd5e1"
                            : !audioBlob
                            ? "#e2e8f0"
                            : "linear-gradient(90deg, #22c55e, #06b6d4)",
                          color: loading || !audioBlob ? "#94a3b8" : "#fff",
                          fontWeight: 700,
                          fontSize: "14px",
                          cursor: loading || !audioBlob ? "not-allowed" : "pointer",
                          boxShadow: !audioBlob ? "none" : "0 4px 10px rgba(34,197,94,0.2)"
                        }}
                      >
                        {loading ? "Analyzing..." : "🚀 Analyze"}
                      </button>
                    </div>
                  </div>

                  {audioUrl && (
                    <div style={{ marginTop: "10px" }}>
                      <audio controls src={audioUrl} style={{ width: "100%", height: "36px" }} />
                    </div>
                  )}

                  <button className="next-word" onClick={loadRandomWord} style={{ marginTop: "auto", alignSelf: "flex-start", padding: "10px 20px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>Next word →</button>
                </div>
              </div>

              {/* 🧙‍♂️ Wizard's Magic Speech Board */}
              {analysisResult && (
                <div
                  style={{
                    padding: "14px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, #fffbeb 0%, #fff1f2 100%)",
                    border: "3px dashed #f472b6",
                    boxShadow: "0 10px 25px rgba(244, 114, 182, 0.15)",
                    width: "100%"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <h3 style={{ margin: 0, color: "#db2777", display: "flex", alignItems: "center", gap: "8px", fontSize: "1.1rem", fontWeight: 900 }}>
                      🪄 Wizard's Speech Magic! ✨
                    </h3>
                    <div style={{ fontSize: "20px", fontWeight: 900, color: "#16a34a" }}>
                      {analysisResult.accuracy ?? 0}% Match
                    </div>
                  </div>

                  {/* Text Transcript Display */}
                  <div style={{ marginBottom: "10px", padding: "10px 12px", background: "#ffffff", borderRadius: "10px", border: "2px solid #22c55e" }}>
                    <div style={{ fontSize: "11px", color: "#16a34a", fontWeight: 800, textTransform: "uppercase", marginBottom: "4px" }}>
                      📝 Speech Transcript
                    </div>
                    <p style={{ margin: 0, fontSize: "14px", color: "#374151", fontWeight: 600 }}>
                      <span style={{ color: "#6b7280" }}>Target:</span> <span style={{ color: "#059669", fontWeight: 800 }}>{word.translations?.[selectedLanguage.split('-')[0]] || word.word}</span>
                      {" | "}
                      <span style={{ color: "#6b7280" }}>You said:</span> <span style={{ color: "#dc2626", fontWeight: 800 }}>{analysisResult.spoken_word || "No speech detected"}</span>
                    </p>
                  </div>

                  {analysisResult.reasoning && (
                    <div style={{ marginBottom: "10px", padding: "10px 12px", background: "#ffffff", borderRadius: "10px", border: "2px solid #c084fc" }}>
                      <div style={{ fontSize: "11px", color: "#a855f7", fontWeight: 800, textTransform: "uppercase", marginBottom: "4px" }}>
                        🗣️ Voice Helper's Advice
                      </div>
                      <p style={{ margin: 0, fontSize: "13px", color: "#374151", fontWeight: 600 }}>
                        {analysisResult.reasoning}
                      </p>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                    {analysisResult.diagnostic_report && (
                      <div style={{ padding: "10px", background: "#faf5ff", borderRadius: "10px", borderTop: "4px solid #c084fc" }}>
                        <span style={{ fontSize: "13px", fontWeight: 800, color: "#7e22ce" }}>🩺 Clinician Diagnostic Report</span>
                        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#4b5563", fontWeight: 500, lineHeight: 1.3 }}>{analysisResult.diagnostic_report}</p>
                      </div>
                    )}

                    <div style={{ padding: "10px", background: "#f0fdf4", borderRadius: "10px", borderTop: "4px solid #4ade80" }}>
                      <span style={{ fontSize: "13px", fontWeight: 800, color: "#15803d" }}>📊 Articulation Diagnostics</span>
                      <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#4b5563", fontWeight: 500, lineHeight: 1.3 }}>
                        <b>Status:</b> {analysisResult.severity_score || "Normal"} <br />
                        <b>Patterns:</b> {analysisResult.error_patterns && analysisResult.error_patterns.length > 0
                          ? analysisResult.error_patterns.join(", ")
                          : "No phonological errors detected."}
                      </p>
                    </div>

                    {analysisResult.recommendations && analysisResult.recommendations.length > 0 && (
                      <div style={{ padding: "10px", background: "#f0f9ff", borderRadius: "10px", borderTop: "4px solid #38bdf8" }}>
                        <span style={{ fontSize: "13px", fontWeight: 800, color: "#0369a1" }}>💨 Acoustic cord check</span>
                        <ul style={{ margin: "4px 0 0 0", paddingLeft: "14px", fontSize: "12px", color: "#4b5563", fontWeight: 500 }}>
                          {analysisResult.recommendations.map((metric, i) => (
                            <li key={i}>{metric}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {linkableLetters.length > 0 && (
                    <div style={{ marginTop: "12px", padding: "10px 12px", background: "#f0f9ff", borderRadius: "10px", border: "2px solid #0ea5e9" }}>
                      <h4 style={{ margin: "0 0 6px 0", color: "#0369a1", fontSize: "13px", fontWeight: 800 }}>✨ Listen & Learn Practice Board:</h4>
                      <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#0284c7", fontWeight: 500 }}>
                        We found some sounds to practice. Click any button below to open the interactive keyboard and see how to position your mouth!
                      </p>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {linkableLetters.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setLetter(item.letter);
                              setSection("alphabet");
                            }}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "999px",
                              border: "none",
                              background: "#0284c7",
                              color: "#fff",
                              fontWeight: 700,
                              fontSize: "12px",
                              cursor: "pointer",
                              boxShadow: "0 4px 8px rgba(2, 132, 199, 0.25)",
                              transition: "all 0.2s ease"
                            }}
                          >
                            🗣️ Learn sound /{item.phoneme}/ (Letter {item.letter})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Phoneme Comparison Display */}
                  <div style={{ marginTop: "12px", padding: "12px", background: "#fef3c7", borderRadius: "10px", border: "2px solid #f59e0b" }}>
                    <h4 style={{ margin: "0 0 8px 0", color: "#d97706", fontSize: "13px", fontWeight: 800 }}>🔊 Phonic Level Comparison</h4>
                    <div style={{ display: "grid", gap: "10px" }}>
                      <div>
                        <h5 style={{ margin: "0 0 6px 0", color: "#7c3aed", fontSize: "12px", fontWeight: 700 }}>Expected Phonemes</h5>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {(analysisResult.expected_phonemes_display || analysisResult.expected_phonemes || []).map((p, i) => (
                            <span
                              key={`expected-${i}`}
                              style={{
                                background: "#ede9fe",
                                color: "#5b21b6",
                                padding: "4px 8px",
                                borderRadius: "999px",
                                fontWeight: 700,
                                fontSize: selectedLanguage !== "en-IN" ? "16px" : "12px",
                                fontFamily: selectedLanguage !== "en-IN" ? "'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', sans-serif" : "inherit"
                              }}
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h5 style={{ margin: "0 0 6px 0", color: "#166534", fontSize: "12px", fontWeight: 700 }}>Detected Phonemes</h5>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {(analysisResult.spoken_phonemes_display || analysisResult.spoken_phonemes || []).map((p, i) => (
                            <span
                              key={`spoken-${i}`}
                              style={{
                                background: "#dcfce7",
                                color: "#166534",
                                padding: "4px 8px",
                                borderRadius: "999px",
                                fontWeight: 700,
                                fontSize: selectedLanguage !== "en-IN" ? "16px" : "12px",
                                fontFamily: selectedLanguage !== "en-IN" ? "'Noto Sans Devanagari', 'Noto Sans Telugu', 'Noto Sans Kannada', sans-serif" : "inherit"
                              }}
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>

                      {analysisResult.phoneme_accuracy && (
                        <div style={{ padding: "8px", background: "#ffffff", borderRadius: "8px", textAlign: "center" }}>
                          <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 600 }}>Phoneme Accuracy: </span>
                          <span style={{ fontSize: "14px", color: "#059669", fontWeight: 800 }}>{analysisResult.phoneme_accuracy}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {section === "alphabet" && (
        <section className="alphabet-assessment">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px", padding: "0 20px" }}>
            <button
              onClick={() => setSection("patient-details")}
              style={{
                padding: "8px 16px",
                border: "2px solid #a855f7",
                borderRadius: "8px",
                background: "#faf5ff",
                color: "#7c3aed",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
                transition: "all 0.3s ease"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#a855f7";
                e.target.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#faf5ff";
                e.target.style.color = "#7c3aed";
              }}
            >
              ✏️ Edit Details
            </button>
          </div>
          <div className="keyboard-card">
            <div className="keyboard-title">
              <div>
                <span>Interactive keyboard</span>
                <h2>Choose an alphabet</h2>
              </div>
              <div className="selected-letter-mini">{letter}</div>
            </div>
            <div style={{ padding: "0 20px 20px 20px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#6d28d9" }}>🌐 Select Language:</label>
              <select 
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "2px solid #a855f7",
                  background: "#faf5ff",
                  color: "#6d28d9",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  marginTop: "8px"
                }}
              >
                {INDIAN_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="alphabet-keyboard">
              {KEYBOARD_ROWS.map((row, rowIndex) => (
                <div className={`keyboard-row row-${rowIndex + 1}`} key={row.join("")}>
                  {row.map((key) => (
                    <button
                      key={key}
                      className={letter === key ? "active" : ""}
                      onClick={() => setLetter(key)}
                      aria-label={`Show articulation for ${key}`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <article className="articulation-card">
            <div className="sound-header">
              <div className="big-letter">{letter}</div>
              <div>
                <span>Letter name</span>
                <h2>{selectedSound.ipa}</h2>
                <p>say <strong>“{selectedSound.spoken}”</strong></p>
              </div>
              <button onClick={() => speakIndianEnglish(selectedSound.spoken, false, selectedLanguage)} aria-label={`Hear the letter ${letter}`}>
                🔊
              </button>
            </div>

            <div className="articulation-content">
              <div className="mouth-visual">
                <MouthDiagram svgKey={letterGuide.svg} />
                <span>Side view of tongue and mouth</span>
              </div>
              <div className="position-guide">
                <div className="position-summary">
                  <span>👄 Shape & position</span>
                  <strong>{letterGuide.anatomy}</strong>
                </div>
                <h3>Make the sound correctly</h3>
                <ol>
                  <li className="letter-transition">{selectedSound.transition}</li>
                  {letterGuide.steps.map((step) => <li key={step}>{step}</li>)}
                
                </ol>
                <div className="stress-tip">
                  <span>💨 Stress, voice & airflow</span>
                  <p>{letterGuide.steps[letterGuide.steps.length - 1]}</p>
                </div>
              </div>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}