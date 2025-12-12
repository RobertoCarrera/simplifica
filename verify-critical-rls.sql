
SELECT
    tablename,
    rowsecurity
FROM
    pg_tables
WHERE
    schemaname = 'public'
    AND tablename IN ('users', 'companies', 'invoices', 'tickets', 'ticket_comments', 'services', 'products', 'clients')
ORDER BY
    tablename;
