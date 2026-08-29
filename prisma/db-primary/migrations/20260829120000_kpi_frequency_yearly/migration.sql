-- Add Yearly (12-month) task recurrence frequency

ALTER TYPE "KpiFrequency" ADD VALUE IF NOT EXISTS 'YEARLY';
