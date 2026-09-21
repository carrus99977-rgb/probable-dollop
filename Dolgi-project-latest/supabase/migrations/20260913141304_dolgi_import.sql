-- Recorded Supabase migration 20260913141304.
create function public.dolgi_import(expected_revision bigint,p_state jsonb,p_hash text default null,p_salt text default null) returns bigint language plpgsql security invoker set search_path='' as $$
declare revision bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 revision:=public.dolgi_save(expected_revision,p_state,true);
 if p_hash is not null then perform public.dolgi_pin('set',p_hash,p_salt); end if;
 return revision;
end $$;
revoke execute on function public.dolgi_import(bigint,jsonb,text,text) from public,anon;
grant execute on function public.dolgi_import(bigint,jsonb,text,text) to authenticated;
