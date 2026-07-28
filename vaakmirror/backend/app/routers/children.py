from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Child
from app.schemas import ChildCreate, ChildOut

router = APIRouter(prefix="/children", tags=["children"])


@router.post("", response_model=ChildOut)
def create_child(payload: ChildCreate, db: Session = Depends(get_db)):
    child = Child(name=payload.name, age=payload.age)
    db.add(child)
    db.commit()
    db.refresh(child)
    return child


@router.get("", response_model=list[ChildOut])
def list_children(db: Session = Depends(get_db)):
    return db.query(Child).order_by(Child.created_at.desc()).all()


@router.get("/{child_id}", response_model=ChildOut)
def get_child(child_id: int, db: Session = Depends(get_db)):
    child = db.query(Child).get(child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    return child
