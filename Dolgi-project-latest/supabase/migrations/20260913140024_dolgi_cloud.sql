-- Recorded Supabase migration 20260913140024. Existing AvtoCalc tables are untouched.
create table public.dolgi_users (
 id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0, pin_hash text, pin_salt text,
 attempts integer not null default 0, blocked_until bigint not null default 0,
 legacy_imported boolean not null default false
);
create table public.dolgi_people (
 user_id uuid not null references public.dolgi_users(id) on delete cascade,
 id text not null,
 name text not null,
 primary key(user_id,id)
);
create table public.dolgi_categories (
 user_id uuid not null references public.dolgi_users(id) on delete cascade,
 id text not null,
 name text not null,
 primary key(user_id,id)
);
create table public.dolgi_debts (
 user_id uuid not null references public.dolgi_users(id) on delete cascade,
 id text not null,
 person_id text not null,
 direction text check(direction in ('in','out')) not null,
 amount bigint check(amount>0 and amount<=9000000000000) not null,
 currency text check(currency in ('RUB','USD','USDT','CNY','EUR','KZT')) not null,
 date date not null,
 due text not null,
 purpose text not null,
 comment text not null,
 category_id text not null,
 created_at text not null,
 primary key(user_id,id)
);
create table public.dolgi_transactions (
 user_id uuid not null references public.dolgi_users(id) on delete cascade,
 id text not null,
 debt_id text not null,
 amount bigint check(amount>0 and amount<=9000000000000) not null,
 kind text check(kind in ('return','setoff')) not null,
 date date not null,
 comment text not null,
 group_id text not null,
 created_at text not null,
 primary key(user_id,id)
);
create table public.dolgi_notes (
 user_id uuid not null references public.dolgi_users(id) on delete cascade,
 id text not null,
 debt_id text not null,
 person_id text not null,
 kind text check(kind in ('note','due','edit')) not null,
 text text not null,
 date date not null,
 created_at text not null,
 primary key(user_id,id)
);
create table public.dolgi_tags (
 user_id uuid not null references public.dolgi_users(id) on delete cascade,
 id text not null,
 name text not null,
 primary key(user_id,id)
);
create table public.dolgi_debt_tags (
 user_id uuid not null references public.dolgi_users(id) on delete cascade,
 debt_id text not null,
 tag_id text not null,
 primary key(user_id,debt_id,tag_id)
);
create table public.dolgi_reminders (
 user_id uuid not null references public.dolgi_users(id) on delete cascade,
 id text not null,
 debt_id text not null,
 days integer check(days between -1 and 7) not null,
 primary key(user_id,id)
);
create table public.dolgi_saved_filters (
 user_id uuid not null references public.dolgi_users(id) on delete cascade,
 id text not null,
 name text not null,
 value jsonb not null,
 primary key(user_id,id)
);
alter table public.dolgi_debts add foreign key(user_id,person_id) references public.dolgi_people(user_id,id) deferrable initially deferred;
alter table public.dolgi_debts add foreign key(user_id,category_id) references public.dolgi_categories(user_id,id) deferrable initially deferred;
alter table public.dolgi_transactions add foreign key(user_id,debt_id) references public.dolgi_debts(user_id,id) deferrable initially deferred;
alter table public.dolgi_notes add foreign key(user_id,person_id) references public.dolgi_people(user_id,id) deferrable initially deferred;
alter table public.dolgi_reminders add foreign key(user_id,debt_id) references public.dolgi_debts(user_id,id) deferrable initially deferred;
alter table public.dolgi_debt_tags add foreign key(user_id,debt_id) references public.dolgi_debts(user_id,id) deferrable initially deferred;
alter table public.dolgi_debt_tags add foreign key(user_id,tag_id) references public.dolgi_tags(user_id,id) deferrable initially deferred;
create index on public.dolgi_debts(user_id,person_id,currency);
create index on public.dolgi_debts(user_id,category_id);
create index on public.dolgi_transactions(user_id,debt_id);
create index on public.dolgi_transactions(user_id,group_id);
create index on public.dolgi_notes(user_id,person_id);
create index on public.dolgi_reminders(user_id,debt_id);
create index on public.dolgi_debt_tags(user_id,tag_id);
alter table public.dolgi_users enable row level security;
create policy dolgi_owner on public.dolgi_users for all to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
revoke all on public.dolgi_users from anon, public;
grant select,insert,update,delete on public.dolgi_users to authenticated;
alter table public.dolgi_people enable row level security;
create policy dolgi_owner on public.dolgi_people for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.dolgi_people from anon, public;
grant select,insert,update,delete on public.dolgi_people to authenticated;
alter table public.dolgi_categories enable row level security;
create policy dolgi_owner on public.dolgi_categories for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.dolgi_categories from anon, public;
grant select,insert,update,delete on public.dolgi_categories to authenticated;
alter table public.dolgi_debts enable row level security;
create policy dolgi_owner on public.dolgi_debts for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.dolgi_debts from anon, public;
grant select,insert,update,delete on public.dolgi_debts to authenticated;
alter table public.dolgi_transactions enable row level security;
create policy dolgi_owner on public.dolgi_transactions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.dolgi_transactions from anon, public;
grant select,insert,update,delete on public.dolgi_transactions to authenticated;
alter table public.dolgi_notes enable row level security;
create policy dolgi_owner on public.dolgi_notes for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.dolgi_notes from anon, public;
grant select,insert,update,delete on public.dolgi_notes to authenticated;
alter table public.dolgi_tags enable row level security;
create policy dolgi_owner on public.dolgi_tags for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.dolgi_tags from anon, public;
grant select,insert,update,delete on public.dolgi_tags to authenticated;
alter table public.dolgi_debt_tags enable row level security;
create policy dolgi_owner on public.dolgi_debt_tags for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.dolgi_debt_tags from anon, public;
grant select,insert,update,delete on public.dolgi_debt_tags to authenticated;
alter table public.dolgi_reminders enable row level security;
create policy dolgi_owner on public.dolgi_reminders for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.dolgi_reminders from anon, public;
grant select,insert,update,delete on public.dolgi_reminders to authenticated;
alter table public.dolgi_saved_filters enable row level security;
create policy dolgi_owner on public.dolgi_saved_filters for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.dolgi_saved_filters from anon, public;
grant select,insert,update,delete on public.dolgi_saved_filters to authenticated;
create function public.dolgi_read() returns jsonb language plpgsql security invoker set search_path='' as $$
declare added integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 insert into public.dolgi_users(id) values(auth.uid()) on conflict do nothing;
 get diagnostics added=row_count;
 if added>0 then
 insert into public.dolgi_categories(user_id,id,name) select auth.uid(),v.id,v.name from (values ('cat0','Авто'),('cat1','Бизнес'),('cat2','Личное'),('cat3','Семья'),('cat4','Партнерство'),('cat5','Другое')) v(id,name);
 end if;
 return jsonb_build_object('state',jsonb_build_object('people',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.id) from public.dolgi_people r where r.user_id=auth.uid()),'[]'::jsonb),
'categories',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.id) from public.dolgi_categories r where r.user_id=auth.uid()),'[]'::jsonb),
'debts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'personId',r.person_id,'direction',r.direction,'amount',r.amount,'currency',r.currency,'date',r.date,'due',r.due,'purpose',r.purpose,'comment',r.comment,'categoryId',r.category_id,'createdAt',r.created_at,'tags',coalesce((select jsonb_agg(dt.tag_id order by dt.tag_id) from public.dolgi_debt_tags dt where dt.user_id=r.user_id and dt.debt_id=r.id),'[]'::jsonb)) order by r.id) from public.dolgi_debts r where r.user_id=auth.uid()),'[]'::jsonb),
'transactions',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'debtId',r.debt_id,'amount',r.amount,'kind',r.kind,'date',r.date,'comment',r.comment,'groupId',r.group_id,'createdAt',r.created_at) order by r.id) from public.dolgi_transactions r where r.user_id=auth.uid()),'[]'::jsonb),
'notes',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'debtId',r.debt_id,'personId',r.person_id,'kind',r.kind,'text',r.text,'date',r.date,'createdAt',r.created_at) order by r.id) from public.dolgi_notes r where r.user_id=auth.uid()),'[]'::jsonb),
'reminders',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'debtId',r.debt_id,'days',r.days) order by r.id) from public.dolgi_reminders r where r.user_id=auth.uid()),'[]'::jsonb),
'filters',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'value',r.value) order by r.id) from public.dolgi_saved_filters r where r.user_id=auth.uid()),'[]'::jsonb)),'user',(select to_jsonb(u) from public.dolgi_users u where u.id=auth.uid()));
end $$;
create function public.dolgi_save(expected_revision bigint,p_state jsonb,p_import boolean default false) returns bigint language plpgsql security invoker set search_path='' as $$
declare next_revision bigint; u public.dolgi_users;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into u from public.dolgi_users where id=auth.uid() for update;
 if u.id is null or u.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001'; end if;
 if p_import and (u.legacy_imported or exists(select 1 from public.dolgi_people where user_id=auth.uid()) or exists(select 1 from public.dolgi_debts where user_id=auth.uid())) then raise exception 'Cloud account is not empty'; end if;
 if jsonb_typeof(p_state)<>'object' then raise exception 'Invalid state'; end if;
 if not (p_state ?& array['people','categories','debts','transactions','notes','reminders','filters']) then raise exception 'Missing records'; end if;
 if jsonb_array_length(p_state->'categories')<1 or jsonb_array_length(p_state->'debts')>5000 or jsonb_array_length(p_state->'transactions')>20000 then raise exception 'Invalid record count'; end if;
delete from public.dolgi_people where user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(p_state->'people') r where r->>'id'=id);
 insert into public.dolgi_people(user_id,id,name) select auth.uid(),(r->>'id')::text,(r->>'name')::text from jsonb_array_elements(p_state->'people') r
 on conflict(user_id,id) do update set name=excluded.name where (dolgi_people.id,dolgi_people.name) is distinct from (excluded.id,excluded.name);
delete from public.dolgi_categories where user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(p_state->'categories') r where r->>'id'=id);
 insert into public.dolgi_categories(user_id,id,name) select auth.uid(),(r->>'id')::text,(r->>'name')::text from jsonb_array_elements(p_state->'categories') r
 on conflict(user_id,id) do update set name=excluded.name where (dolgi_categories.id,dolgi_categories.name) is distinct from (excluded.id,excluded.name);
delete from public.dolgi_debts where user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(p_state->'debts') r where r->>'id'=id);
 insert into public.dolgi_debts(user_id,id,person_id,direction,amount,currency,date,due,purpose,comment,category_id,created_at) select auth.uid(),(r->>'id')::text,(r->>'personId')::text,(r->>'direction')::text,(r->>'amount')::bigint,(r->>'currency')::text,(r->>'date')::date,(r->>'due')::text,(r->>'purpose')::text,(r->>'comment')::text,(r->>'categoryId')::text,(r->>'createdAt')::text from jsonb_array_elements(p_state->'debts') r
 on conflict(user_id,id) do update set person_id=excluded.person_id,direction=excluded.direction,amount=excluded.amount,currency=excluded.currency,date=excluded.date,due=excluded.due,purpose=excluded.purpose,comment=excluded.comment,category_id=excluded.category_id,created_at=excluded.created_at where (dolgi_debts.id,dolgi_debts.person_id,dolgi_debts.direction,dolgi_debts.amount,dolgi_debts.currency,dolgi_debts.date,dolgi_debts.due,dolgi_debts.purpose,dolgi_debts.comment,dolgi_debts.category_id,dolgi_debts.created_at) is distinct from (excluded.id,excluded.person_id,excluded.direction,excluded.amount,excluded.currency,excluded.date,excluded.due,excluded.purpose,excluded.comment,excluded.category_id,excluded.created_at);
delete from public.dolgi_transactions where user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(p_state->'transactions') r where r->>'id'=id);
 insert into public.dolgi_transactions(user_id,id,debt_id,amount,kind,date,comment,group_id,created_at) select auth.uid(),(r->>'id')::text,(r->>'debtId')::text,(r->>'amount')::bigint,(r->>'kind')::text,(r->>'date')::date,(r->>'comment')::text,(r->>'groupId')::text,(r->>'createdAt')::text from jsonb_array_elements(p_state->'transactions') r
 on conflict(user_id,id) do update set debt_id=excluded.debt_id,amount=excluded.amount,kind=excluded.kind,date=excluded.date,comment=excluded.comment,group_id=excluded.group_id,created_at=excluded.created_at where (dolgi_transactions.id,dolgi_transactions.debt_id,dolgi_transactions.amount,dolgi_transactions.kind,dolgi_transactions.date,dolgi_transactions.comment,dolgi_transactions.group_id,dolgi_transactions.created_at) is distinct from (excluded.id,excluded.debt_id,excluded.amount,excluded.kind,excluded.date,excluded.comment,excluded.group_id,excluded.created_at);
delete from public.dolgi_notes where user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(p_state->'notes') r where r->>'id'=id);
 insert into public.dolgi_notes(user_id,id,debt_id,person_id,kind,text,date,created_at) select auth.uid(),(r->>'id')::text,(r->>'debtId')::text,(r->>'personId')::text,(r->>'kind')::text,(r->>'text')::text,(r->>'date')::date,(r->>'createdAt')::text from jsonb_array_elements(p_state->'notes') r
 on conflict(user_id,id) do update set debt_id=excluded.debt_id,person_id=excluded.person_id,kind=excluded.kind,text=excluded.text,date=excluded.date,created_at=excluded.created_at where (dolgi_notes.id,dolgi_notes.debt_id,dolgi_notes.person_id,dolgi_notes.kind,dolgi_notes.text,dolgi_notes.date,dolgi_notes.created_at) is distinct from (excluded.id,excluded.debt_id,excluded.person_id,excluded.kind,excluded.text,excluded.date,excluded.created_at);
delete from public.dolgi_reminders where user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(p_state->'reminders') r where r->>'id'=id);
 insert into public.dolgi_reminders(user_id,id,debt_id,days) select auth.uid(),(r->>'id')::text,(r->>'debtId')::text,(r->>'days')::integer from jsonb_array_elements(p_state->'reminders') r
 on conflict(user_id,id) do update set debt_id=excluded.debt_id,days=excluded.days where (dolgi_reminders.id,dolgi_reminders.debt_id,dolgi_reminders.days) is distinct from (excluded.id,excluded.debt_id,excluded.days);
delete from public.dolgi_saved_filters where user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(p_state->'filters') r where r->>'id'=id);
 insert into public.dolgi_saved_filters(user_id,id,name,value) select auth.uid(),(r->>'id')::text,(r->>'name')::text,r->'value' from jsonb_array_elements(p_state->'filters') r
 on conflict(user_id,id) do update set name=excluded.name,value=excluded.value where (dolgi_saved_filters.id,dolgi_saved_filters.name,dolgi_saved_filters.value) is distinct from (excluded.id,excluded.name,excluded.value);
delete from public.dolgi_debt_tags where user_id=auth.uid();
delete from public.dolgi_tags where user_id=auth.uid();
insert into public.dolgi_tags(user_id,id,name) select distinct auth.uid(),tag,tag from jsonb_array_elements(p_state->'debts') d cross join lateral jsonb_array_elements_text(d->'tags') tag;
insert into public.dolgi_debt_tags(user_id,debt_id,tag_id) select distinct auth.uid(),d->>'id',tag from jsonb_array_elements(p_state->'debts') d cross join lateral jsonb_array_elements_text(d->'tags') tag;
if exists(select 1 from public.dolgi_debts d where d.user_id=auth.uid() and d.amount < coalesce((select sum(t.amount) from public.dolgi_transactions t where t.user_id=d.user_id and t.debt_id=d.id),0)) then raise exception 'Overpayment'; end if;
if exists(select 1 from public.dolgi_transactions t join public.dolgi_debts d on d.user_id=t.user_id and d.id=t.debt_id where t.user_id=auth.uid() and t.date<d.date) then raise exception 'Return precedes debt'; end if;
if exists(select 1 from public.dolgi_transactions t join public.dolgi_debts d on d.user_id=t.user_id and d.id=t.debt_id where t.user_id=auth.uid() and t.kind='setoff' group by t.group_id having count(distinct d.person_id)<>1 or count(distinct d.currency)<>1 or sum(case when d.direction='in' then t.amount else -t.amount end)<>0) then raise exception 'Unbalanced setoff'; end if;
if exists(select 1 from public.dolgi_notes n where n.user_id=auth.uid() and n.debt_id<>'' and not exists(select 1 from public.dolgi_debts d where d.user_id=n.user_id and d.id=n.debt_id and d.person_id=n.person_id)) then raise exception 'Invalid note reference'; end if;
update public.dolgi_users set revision=revision+1,legacy_imported=legacy_imported or p_import where id=auth.uid() returning revision into next_revision;
return next_revision;
end $$;
create function public.dolgi_pin(p_action text,p_hash text default null,p_salt text default null) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_action='fail' then update public.dolgi_users set attempts=attempts+1,blocked_until=case when attempts>=4 then (extract(epoch from now())*1000)::bigint+300000 else 0 end where id=auth.uid();
 elsif p_action='reset' then update public.dolgi_users set attempts=0,blocked_until=0 where id=auth.uid();
 elsif p_action='set' and p_hash ~ '^[0-9a-f]{64}$' and length(p_salt)>20 then update public.dolgi_users set pin_hash=p_hash,pin_salt=p_salt,attempts=0,blocked_until=0 where id=auth.uid();
 elsif p_action='remove' then update public.dolgi_users set pin_hash=null,pin_salt=null,attempts=0,blocked_until=0 where id=auth.uid();
 else raise exception 'Invalid security action'; end if;
end $$;
revoke execute on function public.dolgi_read(),public.dolgi_save(bigint,jsonb,boolean),public.dolgi_pin(text,text,text) from public,anon;
grant execute on function public.dolgi_read(),public.dolgi_save(bigint,jsonb,boolean),public.dolgi_pin(text,text,text) to authenticated;
