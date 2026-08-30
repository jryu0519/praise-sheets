-- Adds a size to each annotation: line width in px for a stroke, font size
-- in px for a text note. Same dual-purpose pattern as `points`/`text`.
alter table annotations add column size integer not null default 2;
