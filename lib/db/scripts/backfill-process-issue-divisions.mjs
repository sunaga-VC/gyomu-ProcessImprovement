import pg from 'pg';
const { Client } = pg;
const c = new Client({ connectionString: 'postgresql://postgres:vegesunaga@0105@localhost:5432/gyoumuhearing' });
await c.connect();

async function run(label, sql) {
  const result = await c.query(sql);
  console.log(`${label}: ${result.rowCount} rows`);
}

await c.query('BEGIN');
try {
  // 1. Ensure a canonical "全社共通" division row exists (do not touch existing null/未設定 data).
  const existing = await c.query("select id from divisions where name = '全社共通'");
  if (existing.rowCount === 0) {
    const inserted = await c.query(
      "insert into divisions (name, description, is_active, sort_order) values ('全社共通', '特定の部門に限定されない全社共通の業務・課題を表す正式な部門区分', true, 0) returning id"
    );
    console.log('inserted 全社共通 division id:', inserted.rows[0].id);
  } else {
    console.log('全社共通 division already exists, id:', existing.rows[0].id);
  }

  // 2. process_divisions: derive from process_departments -> department_divisions.
  await run('process_divisions (via process_departments)', `
    insert into process_divisions (process_id, division_id)
    select distinct pd.process_id, ddv.division_id
    from process_departments pd
    join department_divisions ddv on ddv.department_id = pd.department_id
    where not exists (
      select 1 from process_divisions existing
      where existing.process_id = pd.process_id and existing.division_id = ddv.division_id
    )
  `);

  // 3. process_divisions: legacy fallback for processes with no process_departments rows at all.
  await run('process_divisions (via legacy processes.department_id)', `
    insert into process_divisions (process_id, division_id)
    select distinct p.id, ddv.division_id
    from processes p
    join department_divisions ddv on ddv.department_id = p.department_id
    where p.department_id is not null
      and not exists (select 1 from process_departments pdx where pdx.process_id = p.id)
      and not exists (
        select 1 from process_divisions existing
        where existing.process_id = p.id and existing.division_id = ddv.division_id
      )
  `);

  // 4. issue_departments: derive from issues.department_id (single -> M:N).
  await run('issue_departments (via issues.department_id)', `
    insert into issue_departments (issue_id, department_id)
    select i.id, i.department_id
    from issues i
    where i.department_id is not null
      and not exists (
        select 1 from issue_departments existing
        where existing.issue_id = i.id and existing.department_id = i.department_id
      )
  `);

  // 5. issue_divisions: derive from issues.department_id -> department_divisions.
  await run('issue_divisions (via issues.department_id)', `
    insert into issue_divisions (issue_id, division_id)
    select distinct i.id, ddv.division_id
    from issues i
    join department_divisions ddv on ddv.department_id = i.department_id
    where i.department_id is not null
      and not exists (
        select 1 from issue_divisions existing
        where existing.issue_id = i.id and existing.division_id = ddv.division_id
      )
  `);

  await c.query('COMMIT');
  console.log('backfill committed');
} catch (e) {
  await c.query('ROLLBACK');
  console.error('backfill failed, rolled back:', e);
  process.exitCode = 1;
}

await c.end();
