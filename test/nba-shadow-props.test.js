'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const { evaluateShadowPaths,validateMarket,ALL_MARKETS }=require('../src/research/nba/shadow-props');
const prov={featureAvailableAt:'2026-10-24T17:00:00Z',predictionAt:'2026-10-24T18:00:00Z',eventStartAt:'2026-10-24T23:00:00Z',sampleOrigin:'synthetic_fixture',modelId:'nba-fixture-v0'};
const p=(points,rebounds,assists,steals=0,blocks=0)=>({points,rebounds,assists,steals,blocks,threes:2,turnovers:2});
const paths=[
 {players:{a:p(20,11,9),b:p(10,4,2)},game:{homePoints:110,awayPoints:105}},
 {players:{a:p(24,10,12),b:p(10,4,2)},game:{homePoints:101,awayPoints:102}},
 {players:{a:p(27,12,11),b:p(10,4,2)},game:{homePoints:103,awayPoints:103}}
];
function market(marketType,side,line,extra={}){return {eventId:'NBA-TEST-1',marketType,period:'full_game',overtimeIncluded:true,contractRuleId:'provider-event-contract-test',side,...(line===undefined?{}:{line}),...(marketType.startsWith('player_')?{playerId:'a'}:{}),...extra}}
test('market registry includes main props, combinations, games',()=>{for(const m of ['player_points','player_assists','player_rebounds','player_points_rebounds_assists','player_threes','player_double_double','game_spread','moneyline'])assert.ok(ALL_MARKETS.includes(m))});
test('paired PRA uses same path and preserves covariance',()=>{const x=evaluateShadowPaths({market:market('player_points_rebounds_assists','over',45.5),paths,provenance:prov});assert.equal(x.counts.win,2);assert.equal(x.counts.loss,1);assert.equal(x.authorizedStakeUsd,0);assert.equal(x.verdict,'NO_WAGER_AUTHORITY')});
test('integer line returns push, not loss',()=>{const x=evaluateShadowPaths({market:market('player_points','over',24),paths,provenance:prov});assert.deepEqual(x.counts,{win:1,loss:1,push:1})});
test('double-double and triple-double are different',()=>{let x=evaluateShadowPaths({market:market('player_double_double','yes'),paths,provenance:prov});assert.deepEqual(x.counts,{win:3,loss:0,push:0});x=evaluateShadowPaths({market:market('player_triple_double','yes'),paths,provenance:prov});assert.deepEqual(x.counts,{win:2,loss:1,push:0})});
test('spread uses signed handicap for chosen side',()=>{const x=evaluateShadowPaths({market:market('game_spread','home',-5),paths,provenance:prov});assert.deepEqual(x.counts,{win:0,loss:2,push:1})});
test('missing stat fails closed instead of filling',()=>assert.throws(()=>evaluateShadowPaths({market:market('player_threes','over',2.5),paths:[{players:{a:{points:20}}}],provenance:prov}),/threes/));
test('past-event feature leakage fails closed',()=>assert.throws(()=>evaluateShadowPaths({market:market('player_points','over',22.5),paths,provenance:{...prov,featureAvailableAt:'2026-10-25T00:00:00Z'}}),/ordering/));
test('missing settlement contract fails closed',()=>assert.throws(()=>validateMarket({...market('player_points','over',20.5),contractRuleId:''}),/contractRuleId/));
test('first-half requires actual first-half paths',()=>assert.throws(()=>evaluateShadowPaths({market:{...market('player_points','over',10.5),period:'first_half',overtimeIncluded:false},paths,provenance:prov}),/missing first_half/));
test('game full-time moneyline requires valid overtime rule',()=>assert.throws(()=>validateMarket({...market('moneyline','home'),overtimeIncluded:false}),/including-OT/));
test('tie in full-time moneyline cannot invent result',()=>assert.throws(()=>evaluateShadowPaths({market:market('moneyline','home'),paths,provenance:prov}),/tied/));
test('no conversion from simulation to real-money BET or stake',()=>{const x=evaluateShadowPaths({market:market('player_assists','over',10.5),paths:paths.map(path=>({...path,eventId:'NBA-TEST-1',overtimeIncluded:true})),provenance:{...prov,sampleOrigin:'frozen_model',implementationDigest:'a'.repeat(64),featureSnapshotDigest:'b'.repeat(64)}});assert.equal(x.executionEnabled,false);assert.equal(x.modelStatus,'research_only');assert.equal(x.rawSimulationWinProbability,2/3)});

test('rejects February 31 instead of silently normalizing it to March',()=>assert.throws(()=>evaluateShadowPaths({market:market('player_points','over',20.5),paths,provenance:{...prov,featureAvailableAt:'2026-02-31T10:00:00Z'}}),/real calendar date/));
test('rejects inherited player stat fields, rather than treating prototype as data',()=>{
  const data=Object.create({points:30});
  assert.throws(()=>evaluateShadowPaths({market:market('player_points','over',20.5),paths:[{players:{a:data}}],provenance:prov}),/points/);
});
test('rejects prototype-only player identities',()=>assert.throws(()=>evaluateShadowPaths({market:{...market('player_points','over',20.5),playerId:'__proto__'},paths:[{players:{}}],provenance:prov}),/missing simulated player/));
test('rejects inherited game scores',()=>assert.throws(()=>evaluateShadowPaths({market:market('game_total','over',220),paths:[{game:Object.create({homePoints:120,awayPoints:110})}],provenance:prov}),/homePoints/));
test('rejects a self-declared frozen model without implementation and features digests',()=>assert.throws(()=>evaluateShadowPaths({market:market('player_points','over',20.5),paths,provenance:{...prov,sampleOrigin:'frozen_model'}}),/implementationDigest/));
test('rejects simulation paths for a different event',()=>assert.throws(()=>evaluateShadowPaths({market:market('player_points','over',20.5),paths:paths.map(path=>({...path,eventId:'other-event',overtimeIncluded:true})),provenance:{...prov,sampleOrigin:'frozen_model',implementationDigest:'a'.repeat(64),featureSnapshotDigest:'b'.repeat(64)}}),/eventId mismatch/));
test('rejects frozen model overtime-rule mismatches',()=>assert.throws(()=>evaluateShadowPaths({market:market('player_points','over',20.5),paths:paths.map(path=>({...path,eventId:'NBA-TEST-1',overtimeIncluded:false})),provenance:{...prov,sampleOrigin:'frozen_model',implementationDigest:'a'.repeat(64),featureSnapshotDigest:'b'.repeat(64)}}),/overtime inclusion/));
test('same paths produce coherent monotone over ladder',()=>{
  const a=evaluateShadowPaths({market:market('player_points','over',19.5),paths,provenance:prov});
  const b=evaluateShadowPaths({market:market('player_points','over',25.5),paths,provenance:prov});
  assert.ok(a.rawSimulationWinProbability>=b.rawSimulationWinProbability);
  assert.equal(a.authorizedStakeUsd,0);
});
