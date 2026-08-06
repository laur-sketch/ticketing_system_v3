-- Add Semi Annual (6-month) task recurrence frequency

ALTER TYPE "KpiFrequency" ADD VALUE IF NOT EXISTS 'SEMI_ANNUAL';
