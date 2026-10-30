-- Progresso por episódio (séries) além dos filmes.
ALTER TABLE viewer_progress
  MODIFY content_type ENUM('vod','series') NOT NULL DEFAULT 'vod',
  ADD COLUMN episode_id VARCHAR(40) NOT NULL DEFAULT '' AFTER stream_id,
  ADD UNIQUE KEY uq_progress_ep (profile_id, server_id, content_type, stream_id, episode_id),
  DROP INDEX uq_progress;
