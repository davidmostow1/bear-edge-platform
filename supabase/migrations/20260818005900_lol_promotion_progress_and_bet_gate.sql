create or replace view public.v_model_promotion_progress as
with active as (
  select model_id,count(*)::integer active_predictions,count(distinct canonical_event_id)::integer active_events
  from public.v_active_model_predictions group by model_id
), scored as (
  select model_id,
         count(*) filter(where outcome_a is not null)::integer settled_predictions,
         count(distinct canonical_event_id) filter(where outcome_a is not null)::integer settled_events,
         count(*) filter(where decision_team_a_yes_ask is not null and decision_team_b_yes_ask is not null)::integer decision_price_rows,
         count(*) filter(where closing_team_a_yes_ask is not null and closing_team_b_yes_ask is not null)::integer closing_price_rows
  from public.v_scored_model_predictions group by model_id
), pol as (
  select policy_version,policy from public.model_promotion_policies order by registered_at desc limit 1
)
select r.model_id,r.model_status,r.prospective_calibration_status,r.uncertainty_status,r.bet_authority,
       coalesce(a.active_predictions,0) active_predictions,coalesce(a.active_events,0) active_events,
       coalesce(s.settled_predictions,0) settled_predictions,coalesce(s.settled_events,0) settled_events,
       coalesce(s.decision_price_rows,0) decision_price_rows,coalesce(s.closing_price_rows,0) closing_price_rows,
       case when coalesce(a.active_predictions,0)=0 then 0 else coalesce(s.settled_predictions,0)::double precision/a.active_predictions end settlement_coverage,
       pol.policy_version,
       (pol.policy->>'minimumSettledPredictions')::integer minimum_settled_predictions,
       (pol.policy->>'minimumDistinctEvents')::integer minimum_distinct_events,
       greatest((pol.policy->>'minimumSettledPredictions')::integer-coalesce(s.settled_predictions,0),0) settled_predictions_remaining,
       greatest((pol.policy->>'minimumDistinctEvents')::integer-coalesce(s.settled_events,0),0) distinct_events_remaining
from public.model_registry r
left join active a on a.model_id=r.model_id
left join scored s on s.model_id=r.model_id
cross join pol;

create or replace function public.sbkp_lol_bet_gate_v1(
  p_model_id text,
  p_prediction_id uuid,
  p_market_snapshot_id uuid,
  p_conservative_probability double precision,
  p_fee_adjusted_break_even double precision,
  p_expected_roi double precision,
  p_max_acceptable_price double precision,
  p_current_yes_ask double precision,
  p_quote_fresh boolean,
  p_liquidity_ok boolean,
  p_spread_ok boolean,
  p_roster_ok boolean,
  p_patch_ok boolean,
  p_no_source_conflict boolean,
  p_no_live_state_ambiguity boolean,
  p_no_correlation_violation boolean,
  p_no_portfolio_risk_violation boolean
) returns jsonb
language plpgsql stable as $$
declare
  r public.model_registry%rowtype;
  p public.model_predictions%rowtype;
  c public.model_prediction_context%rowtype;
  s public.model_market_snapshots%rowtype;
  i public.model_probability_intervals%rowtype;
  checks jsonb;
  allowed boolean;
begin
  select * into r from public.model_registry where model_id=p_model_id;
  select * into p from public.model_predictions where id=p_prediction_id and model_id=p_model_id;
  select * into c from public.model_prediction_context where prediction_id=p_prediction_id;
  select * into s from public.model_market_snapshots where id=p_market_snapshot_id and prediction_id=p_prediction_id and snapshot_kind='DECISION';
  select * into i from public.model_probability_intervals where prediction_id=p_prediction_id order by generated_at desc,created_at desc limit 1;

  checks := jsonb_build_object(
    'model_registered', r.model_id is not null,
    'model_validated', coalesce(r.model_status='VALIDATED',false),
    'bet_authority', coalesce(r.bet_authority,false),
    'prospective_calibration_verified', coalesce(r.prospective_calibration_status='VERIFIED',false),
    'uncertainty_verified', coalesce(r.uncertainty_status='VERIFIED',false),
    'prediction_registered', p.id is not null,
    'prediction_prospective', coalesce(p.is_prospective,false),
    'event_identity_verified', coalesce(c.event_identity_status='VERIFIED',false),
    'roster_verified', coalesce(c.roster_status='VERIFIED',false) and coalesce(p_roster_ok,false),
    'patch_verified', coalesce(c.patch_status='VERIFIED',false) and coalesce(p_patch_ok,false),
    'calibrated_interval_present', i.id is not null,
    'exact_market_snapshot_present', s.id is not null and upper(s.provider)='KALSHI',
    'exchange_source_timestamp_present', s.source_time is not null,
    'quote_fresh', coalesce(p_quote_fresh,false),
    'liquidity_ok', coalesce(p_liquidity_ok,false),
    'spread_ok', coalesce(p_spread_ok,false),
    'conservative_probability_valid', p_conservative_probability is not null and p_conservative_probability between 0 and 1,
    'fee_adjusted_break_even_valid', p_fee_adjusted_break_even is not null and p_fee_adjusted_break_even between 0 and 1,
    'minimum_edge_passed', p_conservative_probability is not null and p_fee_adjusted_break_even is not null and p_conservative_probability>p_fee_adjusted_break_even,
    'positive_expected_roi', coalesce(p_expected_roi>0,false),
    'max_price_passed', p_max_acceptable_price is not null and p_current_yes_ask is not null and p_current_yes_ask<=p_max_acceptable_price,
    'no_source_conflict', coalesce(p_no_source_conflict,false),
    'no_live_state_ambiguity', coalesce(p_no_live_state_ambiguity,false),
    'no_correlation_violation', coalesce(p_no_correlation_violation,false),
    'no_portfolio_risk_violation', coalesce(p_no_portfolio_risk_violation,false)
  );

  select bool_and(value::boolean) into allowed from jsonb_each_text(checks);
  return jsonb_build_object('allowed',coalesce(allowed,false),'model_id',p_model_id,'prediction_id',p_prediction_id,'market_snapshot_id',p_market_snapshot_id,'checks',checks);
end;
$$;

revoke all on function public.sbkp_lol_bet_gate_v1(text,uuid,uuid,double precision,double precision,double precision,double precision,double precision,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public;