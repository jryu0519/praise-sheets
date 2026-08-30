-- Adds text notes (alongside pen strokes) and a chosen color per annotation.
-- For a stroke, `points` is the path; for a text note, `points` holds a
-- single [[x,y]] anchor point and `text` holds the note's content.
alter table annotations add column type text not null default 'stroke' check (type in ('stroke', 'text'));
alter table annotations add column text text;
alter table annotations add column color text not null default '#e63946';

alter table annotations
  add constraint text_annotations_have_text check (type <> 'text' or text is not null);
