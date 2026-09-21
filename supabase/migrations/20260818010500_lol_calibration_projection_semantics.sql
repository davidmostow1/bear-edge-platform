create or replace view public.v_lol_calibration_rows as
with latest_outcomes as (
  select * from (
    select o.*,row_number() over(partition by o.canonical_event_id order by o.created_at desc,o.resolved_at desc,o.id desc) r
    from public.model_event_outcomes o
  ) x where r=1
), latest_decision as (
  select * from (
    select s.*,row_number() over(partition by s.prediction_id order by s.captured_at desc,s.created_at desc,s.id desc) r
    from public.model_market_snapshots s where s.snapshot_kind='DECISION' and s.prediction_id is not null
  ) x where r=1
), latest_closing as (
  select * from (
    select s.*,row_number() over(partition by s.canonical_event_id order by s.captured_at desc,s.created_at desc,s.id desc) r
    from public.model_market_snapshots s where s.snapshot_kind='CLOSING' and s.is_final=true
  ) x where r=1
)
select p.id prediction_id,p.model_id,p.canonical_event_id,p.market_family,p.team_a,p.team_b,p.best_of,p.raw_probability_a,
       p.generated_at,p.evidence_cutoff_at,p.scheduled_start_at,p.event_identity_status,p.roster_status,p.patch_status,
       p.source_digest prediction_source_digest,p.source_snapshot prediction_source_snapshot,
       o.event_status,o.winner_team,o.resolved_at outcome_resolved_at,o.source_digest outcome_source_digest,o.verification_status outcome_verification_status,
       case when o.event_status='FINAL' and o.winner_team=p.team_a then 1 when o.event_status='FINAL' and o.winner_team=p.team_b then 0 else null end outcome_a,
       d.team_a_yes_bid decision_team_a_yes_bid,d.team_a_yes_ask decision_team_a_yes_ask,d.team_b_yes_bid decision_team_b_yes_bid,d.team_b_yes_ask decision_team_b_yes_ask,
       d.captured_at decision_captured_at,d.source_time decision_source_time,d.source_digest decision_source_digest,d.verification_status decision_verification_status,
       c.team_a_yes_bid closing_team_a_yes_bid,c.team_a_yes_ask closing_team_a_yes_ask,c.team_b_yes_bid closing_team_b_yes_bid,c.team_b_yes_ask closing_team_b_yes_ask,
       c.captured_at closing_captured_at,c.source_time closing_source_time,c.source_digest closing_source_digest,c.verification_status closing_verification_status,c.is_final closing_is_final
from public.v_active_model_predictions p
left join latest_outcomes o on o.canonical_event_id=p.canonical_event_id
left join latest_decision d on d.prediction_id=p.id
left join latest_closing c on c.canonical_event_id=p.canonical_event_id;

drop view if exists public.v_model_promotion_progress;
create view public.v_model_promotion_progress as
with active as (
  select model_id,count(*)::integer active_predictions,count(distinct canonical_event_id)::integer active_events
  from public.v_active_model_predictions group by model_id
), scored as (
  select model_id,
         count(*) filter(where outcome_a is not null)::integer collected_settled_predictions,
         count(distinct canonical_event_id) filter(where outcome_a is not null)::integer collected_settled_events,
         count(*) filter(where decision_team_a_yes_ask is not null and decision_team_b_yes_ask is not null)::integer decision_price_rows,
         count(*) filter(where closing_team_a_yes_ask is not null and closing_team_b_yes_ask is not null)::integer closing_price_rows
  from public.v_scored_model_predictions group by model_id
), pol as (
  select policy_version,policy from public.model_promotion_policies order by registered_at desc limit 1
)
select r.model_id,r.model_status,r.prospective_calibration_status,r.uncertainty_status,r.bet_authority,
       coalesce(a.active_predictions,0) collected_active_predictions,coalesce(a.active_events,0) collected_active_events,
       coalesce(s.collected_settled_predictions,0) collected_settled_predictions,coalesce(s.collected_settled_events,0) collected_settled_events,
       coalesce(s.decision_price_rows,0) decision_price_rows,coalesce(s.closing_price_rows,0) closing_price_rows,
       case when coalesce(a.active_predictions,0)=0 then 0 else coalesce(s.collected_settled_predictions,0)::double precision/a.active_predictions end collected_settlement_coverage,
       pol.policy_version,
       (pol.policy->>'minimumSettledPredictions')::integer minimum_evaluation_settled_predictions,
       (pol.policy->>'minimumDistinctEvents')::integer minimum_evaluation_distinct_events,
       (pol.policy->>'minimumBucketObservations')::integer minimum_evaluation_bucket_observations,
       'Thresholds apply to held-out evaluation evidence after event-atomic 60/20/20 splitting; collected totals are not direct promotion remaining counts.'::text progress_semantics
from public.model_registry r
left join active a on a.model_id=r.model_id
left join scored s on s.model_id=r.model_id
cross join pol;
