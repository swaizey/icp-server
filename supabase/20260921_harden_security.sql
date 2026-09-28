-- Apply this migration to an existing Supabase project.
-- Do not rerun schema.sql on a database where its types and tables already exist.

alter view public.dashboard_overview set (security_invoker = true);
alter view public.sacrament_summary set (security_invoker = true);
alter view public.sacrament_breakdown set (security_invoker = true);
alter view public.group_summary set (security_invoker = true);
alter view public.minister_summary set (security_invoker = true);
alter view public.report_summary set (security_invoker = true);
alter view public.membership_trend set (security_invoker = true);

revoke all on public.dashboard_overview from anon, authenticated;
revoke all on public.sacrament_summary from anon, authenticated;
revoke all on public.sacrament_breakdown from anon, authenticated;
revoke all on public.group_summary from anon, authenticated;
revoke all on public.minister_summary from anon, authenticated;
revoke all on public.report_summary from anon, authenticated;
revoke all on public.membership_trend from anon, authenticated;

grant select on public.dashboard_overview to authenticated;
grant select on public.sacrament_summary to authenticated;
grant select on public.sacrament_breakdown to authenticated;
grant select on public.group_summary to authenticated;
grant select on public.minister_summary to authenticated;
grant select on public.report_summary to authenticated;
grant select on public.membership_trend to authenticated;

revoke all on function public.current_app_user() from public;
revoke all on function public.has_permission(text) from public;
grant execute on function public.current_app_user() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
