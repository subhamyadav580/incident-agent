from sqlalchemy.orm import Session

from ..models.app_settings import SINGLETON_ID, AppSettings


class SettingsRepo:
    def __init__(self, session: Session):
        self.session = session

    def get_or_create(self) -> AppSettings:
        row = self.session.get(AppSettings, SINGLETON_ID)
        if row is None:
            row = AppSettings(id=SINGLETON_ID, settings={}, secrets="")
            self.session.add(row)
            self.session.commit()
            self.session.refresh(row)
        return row

    def save(self, row: AppSettings) -> AppSettings:
        self.session.commit()
        self.session.refresh(row)
        return row
