async function fetchJson(url) {
  if (url.includes("api.the-odds-api.com/v4/sports/") && url.endsWith("/sports/?apiKey=test-odds-key")) {
    return [
      {
        key: "baseball_mlb",
        group: "Baseball",
        title: "MLB",
        active: true
      },
      {
        key: "icehockey_nhl",
        group: "Ice Hockey",
        title: "NHL",
        active: true
      }
    ];
  }

  if (url.includes("api.the-odds-api.com/v4/sports/baseball_mlb/odds")) {
    return [
      {
        id: "odds-event-1",
        sport_key: "baseball_mlb",
        commence_time: "2026-06-17T23:05:00Z",
        home_team: "Cincinnati Reds",
        away_team: "New York Mets",
        bookmakers: [
          {
            key: "draftkings",
            title: "DraftKings",
            last_update: "2026-07-08T16:00:00Z",
            markets: [
              {
                key: "h2h",
                last_update: "2026-07-08T16:00:00Z",
                outcomes: [
                  { name: "Cincinnati Reds", price: -145 },
                  { name: "New York Mets", price: 125 }
                ]
              }
            ]
          },
          {
            key: "fanduel",
            title: "FanDuel",
            last_update: "2026-07-08T16:01:00Z",
            markets: [
              {
                key: "h2h",
                last_update: "2026-07-08T16:01:00Z",
                outcomes: [
                  { name: "Cincinnati Reds", price: -140 },
                  { name: "New York Mets", price: 120 }
                ]
              }
            ]
          }
        ]
      }
    ];
  }

  if (url.includes("api.the-odds-api.com/v4/sports/baseball_mlb/events/odds-event-1/odds")) {
    return {
      id: "odds-event-1",
      sport_key: "baseball_mlb",
      commence_time: "2026-06-17T23:05:00Z",
      home_team: "Cincinnati Reds",
      away_team: "New York Mets",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          last_update: "2026-06-17T21:00:00Z",
          markets: [
            {
              key: "pitcher_strikeouts",
              last_update: "2026-06-17T21:00:00Z",
              outcomes: [
                { name: "Over", description: "Nolan McLean", price: 145, point: 1.5 },
                { name: "Under", description: "Nolan McLean", price: -180, point: 1.5 },
                { name: "Over", description: "Nick Lodolo", price: 120, point: 1.5 },
                { name: "Under", description: "Nick Lodolo", price: -150, point: 1.5 }
              ]
            },
            {
              key: "batter_total_bases",
              last_update: "2026-06-17T21:00:00Z",
              outcomes: [
                { name: "Over", description: "Mets Sample Batter", price: 110, point: 1.5 },
                { name: "Under", description: "Mets Sample Batter", price: -140, point: 1.5 },
                { name: "Over", description: "Reds Sample Batter", price: 115, point: 1.5 },
                { name: "Under", description: "Reds Sample Batter", price: -145, point: 1.5 }
              ]
            },
            {
              key: "batter_hits",
              last_update: "2026-06-17T21:00:00Z",
              outcomes: [
                { name: "Over", description: "Mets Sample Batter", price: -110, point: 1.5 },
                { name: "Under", description: "Mets Sample Batter", price: -120, point: 1.5 },
                { name: "Over", description: "Reds Sample Batter", price: -105, point: 1.5 },
                { name: "Under", description: "Reds Sample Batter", price: -125, point: 1.5 }
              ]
            }
          ]
        },
        {
          key: "fanduel",
          title: "FanDuel",
          last_update: "2026-06-17T21:01:00Z",
          markets: [
            {
              key: "pitcher_strikeouts",
              last_update: "2026-06-17T21:01:00Z",
              outcomes: [
                { name: "Over", description: "Nolan McLean", price: 135, point: 1.5 },
                { name: "Under", description: "Nolan McLean", price: -165, point: 1.5 },
                { name: "Over", description: "Nick Lodolo", price: 115, point: 1.5 },
                { name: "Under", description: "Nick Lodolo", price: -140, point: 1.5 }
              ]
            },
            {
              key: "batter_total_bases",
              last_update: "2026-06-17T21:01:00Z",
              outcomes: [
                { name: "Over", description: "Mets Sample Batter", price: 105, point: 1.5 },
                { name: "Under", description: "Mets Sample Batter", price: -130, point: 1.5 },
                { name: "Over", description: "Reds Sample Batter", price: 110, point: 1.5 },
                { name: "Under", description: "Reds Sample Batter", price: -135, point: 1.5 }
              ]
            },
            {
              key: "batter_hits",
              last_update: "2026-06-17T21:01:00Z",
              outcomes: [
                { name: "Over", description: "Mets Sample Batter", price: -105, point: 1.5 },
                { name: "Under", description: "Mets Sample Batter", price: -115, point: 1.5 },
                { name: "Over", description: "Reds Sample Batter", price: -100, point: 1.5 },
                { name: "Under", description: "Reds Sample Batter", price: -120, point: 1.5 }
              ]
            }
          ]
        }
      ]
    };
  }

  if (url.includes("site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard")) {
    const parsedUrl = new URL(url);
    const date = parsedUrl.searchParams.get("dates") ?? "20260617";

    return {
      timestamp: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T21:41:04Z`,
      events: [
        {
          id: "401999001",
          date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T23:05:00Z`,
          competitions: [
            {
              competitors: [
                {
                  homeAway: "away",
                  team: { id: "21", displayName: "New York Mets" }
                },
                {
                  homeAway: "home",
                  team: { id: "17", displayName: "Cincinnati Reds" }
                }
              ]
            }
          ],
          status: {
            type: { name: "STATUS_SCHEDULED", state: "pre", description: "Scheduled" }
          }
        }
      ]
    };
  }

  if (
    url.includes("site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard") ||
    url.includes("site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard") ||
    url.includes("site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard")
  ) {
    const parsedUrl = new URL(url);
    const date = parsedUrl.searchParams.get("dates") ?? "20260617";

    return {
      timestamp: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T21:41:04Z`,
      events: []
    };
  }

  if (url.includes("site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard")) {
    const parsedUrl = new URL(url);
    const date = parsedUrl.searchParams.get("dates") ?? "20260617";

    return {
      leagues: [
        {
          name: "FIFA World Cup",
          abbreviation: "FIFA World Cup"
        }
      ],
      events: [
        {
          id: "760480",
          date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T21:00Z`,
          name: "Ghana at Croatia",
          shortName: "GHA @ CRO",
          competitions: [
            {
              id: "760480",
              date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T21:00Z`,
              status: {
                type: {
                  state: "pre",
                  description: "Scheduled",
                  detail: "Scheduled"
                }
              },
              venue: {
                fullName: "Lincoln Financial Field"
              },
              altGameNote: "FIFA World Cup, Group L",
              competitors: [
                {
                  homeAway: "home",
                  score: "0",
                  form: "WLWLL",
                  records: [{ summary: "1-0-1" }],
                  team: {
                    id: "477",
                    abbreviation: "CRO",
                    displayName: "Croatia",
                    shortDisplayName: "Croatia",
                    logo: "https://a.espncdn.com/i/teamlogos/countries/500/cro.png"
                  }
                },
                {
                  homeAway: "away",
                  score: "0",
                  form: "DWWLW",
                  records: [{ summary: "0-1-1" }],
                  team: {
                    id: "4469",
                    abbreviation: "GHA",
                    displayName: "Ghana",
                    shortDisplayName: "Ghana",
                    logo: "https://a.espncdn.com/i/teamlogos/countries/500/gha.png"
                  }
                }
              ]
            }
          ]
        }
      ]
    };
  }

  if (url === "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams") {
    return {
      sports: [
        {
          leagues: [
            {
              teams: Array.from({ length: 30 }, (_, index) => ({ team: { id: String(index + 1) } }))
            }
          ]
        }
      ]
    };
  }

  if (url === "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries") {
    return {
      timestamp: "2026-06-17T21:41:04Z",
      injuries: [
        {
          id: "21",
          displayName: "New York Mets",
          injuries: [
            {
              id: "injury-1",
              athlete: { displayName: "Sample Injured Player" },
              status: "Day-To-Day"
            }
          ]
        }
      ]
    };
  }

  if (url.includes("site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/") && url.endsWith("/roster")) {
    return {
      timestamp: "2026-06-17T21:41:04Z",
      athletes: [
        {
          position: "Pitchers",
          items: Array.from({ length: 13 }, (_, index) => ({ id: String(index + 1) }))
        },
        {
          position: "Batters",
          items: Array.from({ length: 13 }, (_, index) => ({ id: String(index + 100) }))
        }
      ]
    };
  }

  if (url.includes("www.statnews.com/?rest_route=/wp/v2/search")) {
    return [
      {
        id: 1373441,
        title: "Pro sports leagues should do away with injury reports",
        url: "https://www.statnews.com/2025/09/21/nfl-injury-list-sports-betting-athlete-medical-privacy/"
      }
    ];
  }

  if (url.includes("statsapi.mlb.com/api/v1/schedule")) {
    const parsedUrl = new URL(url);
    const date = parsedUrl.searchParams.get("date") ?? "2026-06-17";

    return {
      dates: [
        {
          date,
          games: [
            {
              gamePk: 1,
              gameDate: `${date}T23:05:00Z`,
              status: {
                abstractGameState: "Preview",
                detailedState: "Scheduled"
              },
              teams: {
                away: {
                  team: { id: 121, name: "New York Mets" },
                  leagueRecord: { wins: 33, losses: 41 },
                  probablePitcher: { id: 690997, fullName: "Nolan McLean" }
                },
                home: {
                  team: { id: 113, name: "Cincinnati Reds" },
                  leagueRecord: { wins: 35, losses: 38 },
                  probablePitcher: { id: 666157, fullName: "Nick Lodolo" }
                }
              },
              venue: { name: "Great American Ball Park" }
            }
          ]
        }
      ]
    };
  }

  if (url.includes("statsapi.mlb.com/api/v1.1/game/1/feed/live")) {
    return {
      gamePk: 1,
      gameData: {
        status: {
          abstractGameState: "Live",
          detailedState: "In Progress"
        },
        teams: {
          away: { id: 121, name: "Sample Team" },
          home: { id: 122, name: "Opponent Team" }
        }
      },
      liveData: {
        linescore: {
          currentInning: 7,
          inningHalf: "Bottom",
          scheduledInnings: 9,
          outs: 1
        },
        boxscore: {
          teams: {
            away: {
              players: {
                ID1: {
                  person: {
                    id: 1,
                    fullName: "Sample Hitter"
                  },
                  stats: {
                    batting: {
                      totalBases: 2,
                      runs: 1,
                      hits: 1
                    },
                    pitching: {}
                  },
                  gameStatus: {
                    isCurrentBatter: false,
                    isCurrentPitcher: false,
                    isOnBench: false,
                    isSubstitute: false
                  }
                }
              }
            },
            home: {
              players: {}
            }
          }
        }
      }
    };
  }

  if (url.includes("statsapi.mlb.com/api/v1/teams/") && url.includes("/roster")) {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split("/");
    const teamId = Number(pathParts[pathParts.indexOf("teams") + 1]);
    const teamPrefix = teamId === 121 ? "Mets" : "Reds";

    return {
      roster: [
        {
          person: { id: teamId * 1000 + 1, fullName: `${teamPrefix} Sample Batter` },
          jerseyNumber: "12",
          position: { code: "7", name: "Left Fielder", type: "Outfielder", abbreviation: "LF" },
          status: { code: "A", description: "Active" }
        },
        {
          person: { id: teamId * 1000 + 2, fullName: `${teamPrefix} Sample Catcher` },
          jerseyNumber: "28",
          position: { code: "2", name: "Catcher", type: "Catcher", abbreviation: "C" },
          status: { code: "A", description: "Active" }
        },
        {
          person: { id: teamId * 1000 + 3, fullName: `${teamPrefix} Sample Pitcher` },
          jerseyNumber: "45",
          position: { code: "1", name: "Pitcher", type: "Pitcher", abbreviation: "P" },
          status: { code: "A", description: "Active" }
        }
      ]
    };
  }

  if (url.includes("api-web.nhle.com/v1/score/")) {
    const date = url.split("/").pop() ?? "2026-06-17";

    return {
      currentDate: date,
      games: [
        {
          id: 2025030416,
          gameDate: date,
          startTimeUTC: `${date}T23:00:00Z`,
          gameState: "FUT",
          gameScheduleState: "OK",
          venue: { default: "Sample Arena" },
          awayTeam: {
            id: 12,
            name: { default: "Hurricanes" },
            abbrev: "CAR",
            score: 0,
            sog: 0
          },
          homeTeam: {
            id: 54,
            name: { default: "Golden Knights" },
            abbrev: "VGK",
            score: 0,
            sog: 0
          }
        }
      ]
    };
  }

  if (url.includes("api-web.nhle.com/v1/roster/")) {
    return {
      forwards: [
        {
          id: 8478402,
          firstName: { default: "Sebastian" },
          lastName: { default: "Aho" },
          positionCode: "C",
          sweaterNumber: 20
        },
        {
          id: 8478427,
          firstName: { default: "Sample" },
          lastName: { default: "Winger" },
          positionCode: "R",
          sweaterNumber: 86
        }
      ],
      defensemen: [
        {
          id: 8477496,
          firstName: { default: "Sample" },
          lastName: { default: "Defenseman" },
          positionCode: "D",
          sweaterNumber: 74
        }
      ],
      goalies: [
        {
          id: 8476883,
          firstName: { default: "Sample" },
          lastName: { default: "Goalie" },
          positionCode: "G",
          sweaterNumber: 31
        }
      ]
    };
  }

  if (url.includes("statsapi.mlb.com")) {
    return {
      stats: [
        {
          type: { displayName: "season" },
          splits: [
            {
              stat: {
                gamesPlayed: 100,
                totalBases: 180,
                hits: 110,
                runs: 80,
                strikeOuts: 120
              },
              player: { fullName: "Sample Hitter" },
              team: { name: "Sample Team" }
            }
          ]
        },
        {
          type: { displayName: "lastXGames" },
          splits: [
            {
              stat: {
                gamesPlayed: 10,
                totalBases: 22,
                hits: 13,
                runs: 12,
                strikeOuts: 18
              },
              player: { fullName: "Sample Hitter" },
              team: { name: "Sample Team" }
            }
          ]
        }
      ]
    };
  }

  if (url.includes("api-web.nhle.com")) {
    return {
      firstName: { default: "Sample" },
      lastName: { default: "Skater" },
      fullTeamName: { default: "Sample Club" },
      featuredStats: {
        regularSeason: {
          subSeason: {
            gamesPlayed: 82,
            points: 120,
            shots: 300
          }
        }
      },
      last5Games: [
        { points: 3, shots: 4 },
        { points: 2, shots: 5 },
        { points: 1, shots: 4 },
        { points: 2, shots: 3 },
        { points: 0, shots: 6 }
      ]
    };
  }

  throw new Error(`Unexpected URL in test: ${url}`);
}

async function fetchText(url) {
  if (url === "https://www.statmuse.com/") {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "text/html",
      text:
        '<html><head><title>StatMuse | Search StatMuse, save time.</title></head><body>' +
        '<a href="/nba">NBA</a><a href="/nhl">NHL</a><a href="/mlb">MLB</a><a href="/wnba">WNBA</a>' +
        '<a href="/nfl">NFL</a><a href="/cfb">CFB</a><a href="/pga">PGA</a><a href="/fc">FC</a></body></html>'
    };
  }

  if (url === "https://www.statmuse.com/scores") {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "text/html",
      text:
        '<html><head><title>Scores | StatMuse</title><meta name="description" content="Live scores, results and schedule"></head>' +
        "<body><h1>Scores</h1></body></html>"
    };
  }

  if (url.includes("www.statmuse.com/") && url.includes("/ask?q=")) {
    const isMlb = url.includes("/mlb/");

    return {
      ok: isMlb,
      status: isMlb ? 200 : 422,
      statusText: isMlb ? "OK" : "Unprocessable Content",
      contentType: "text/html",
      text: isMlb
        ? '<html><head><title>MLB Games Today | StatMuse</title><meta name="description" content="TOR @ BOS - today at 6:45 PM ET"></head></html>'
        : '<html><head><title>StatMuse | Search StatMuse, save time.</title><meta name="description" content="I did not find any scheduled games."></head></html>'
    };
  }

  if (url.includes("sportsbook-nash.draftkings.com") || url.includes("sportsbook.draftkings.com")) {
    return {
      ok: false,
      status: 403,
      statusText: "Forbidden",
      contentType: "text/html",
      text: "<html><body>Access Denied</body></html>"
    };
  }

  if (url === "https://www.hardrock.bet/sportsbook/baseball/mlb/") {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "text/html",
      text:
        "<html><head><title>MLB Odds</title></head><body>" +
        "<h1>MLB Odds: Run Lines, Winners, Parlays, Props, Futures & FAQ 2026</h1>" +
        "<p>MLB moneyline bets MLB totals MLB run lines MLB futures MLB props MLB parlays MLB SGPs MLB live betting</p>" +
        "</body></html>"
    };
  }

  if (url === "https://www.hardrock.bet/sportsbook/soccer/world-cup-odds/") {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "text/html",
      text:
        "<html><head><title>World Cup 2026 Odds</title></head><body>" +
        "<h1>World Cup 2026 Odds & Betting Guide</h1>" +
        "<p>World Cup futures Individual match betting World Cup props and specials Live betting on the World Cup World Cup SGPs three-way moneyline Total Goals First Goalscorer Anytime Goalscorer</p>" +
        "</body></html>"
    };
  }

  if (url === "https://www.covers.com/sport/baseball/mlb/player-props") {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "text/html",
      text:
        '<section class="picks-card game-projections-container" data-id="123941880" data-market-id="167" data-diff="&#x2B;0.5" data-ev="15.86" data-rating="15.86">' +
        '<span class="me-2 _badge _badge-sm badge-style-primary-subtle">TOTAL BASES</span>' +
        '<a href="/sport/baseball/mlb/matchup/369096/picks#props" class="projection-game-link fs-12 text-body-secondary border-0">ATH @ LAA</a>' +
        '<a href="/sport/baseball/mlb/players/193859/shea-langeliers" class="player-link"> S. Langeliers </a>' +
        '<span class="player-position"> (C)</span>' +
        '<span class="prediction fw-normal text-wrap">1.5 Total Bases</span>' +
        '<span class="fs-11">2.01 </span><span class="proj-text text-primary p-1 rounded fs-13">PROJECTION</span>' +
        '<div class="compare-odds-column"><img class="sportsbook-logo" src="/dk.png" alt="DraftKings logo" /><a class="book-odds border-dark-subtle" href="#"><b>o1.5</b> &nbsp;&#x2B;113 </a></div></div>' +
        '<div class="compare-odds-column"><img class="sportsbook-logo" src="/mgm.png" alt="BetMGM logo" /><a class="book-odds border-dark-subtle" href="#"><b>o1.5</b> &nbsp;&#x2B;125 </a></div></div>' +
        "</section>"
    };
  }

  return {
    ok: true,
    status: 200,
    statusText: "OK",
    contentType: "application/json",
    text: JSON.stringify(await fetchJson(url))
  };
}

module.exports = {
  fetchJson,
  fetchText
};
