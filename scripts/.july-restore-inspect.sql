SELECT 'Ticket' AS t, COUNT(*)::int AS c FROM public."Ticket"
UNION ALL SELECT 'PortalAccount', COUNT(*)::int FROM public."PortalAccount"
UNION ALL SELECT 'Agent', COUNT(*)::int FROM public."Agent"
UNION ALL SELECT 'Team', COUNT(*)::int FROM public."Team"
UNION ALL SELECT 'KpiMaintenance', COUNT(*)::int FROM public."KpiMaintenance"
UNION ALL SELECT 'KpiMaintenancePeriodSnapshot', COUNT(*)::int FROM public."KpiMaintenancePeriodSnapshot"
UNION ALL SELECT 'TaskItem', COUNT(*)::int FROM public."TaskItem"
UNION ALL SELECT 'HelpdeskCsvTicket', COUNT(*)::int FROM public."HelpdeskCsvTicket"
UNION ALL SELECT 'TicketActivity', COUNT(*)::int FROM public."TicketActivity"
UNION ALL SELECT 'TicketMessage', COUNT(*)::int FROM public."TicketMessage"
UNION ALL SELECT 'TicketFeedback', COUNT(*)::int FROM public."TicketFeedback";

SELECT column_name FROM information_schema.columns WHERE table_name='PortalAccount' ORDER BY ordinal_position;
SELECT column_name FROM information_schema.columns WHERE table_name='Ticket' ORDER BY ordinal_position;
