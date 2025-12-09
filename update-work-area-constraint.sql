-- Update the work_area constraint to use new category names
ALTER TABLE hourly_tasks DROP CONSTRAINT IF EXISTS hourly_tasks_work_area_check;
ALTER TABLE hourly_tasks ADD CONSTRAINT hourly_tasks_work_area_check 
CHECK (work_area IN ('music-prod', 'video-creation', 'administrative', 'other', 'note-other'));
