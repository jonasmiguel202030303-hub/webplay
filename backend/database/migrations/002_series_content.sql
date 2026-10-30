-- Séries: favoritos e histórico passam a aceitar content_type 'series'.
ALTER TABLE viewer_favorites MODIFY content_type ENUM('live','vod','series') NOT NULL;
ALTER TABLE viewer_history MODIFY content_type ENUM('live','vod','series') NOT NULL;
