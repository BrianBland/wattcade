import type { Item } from './types';

/** Original reward key → replacement. Keep this mapping for old profiles and picks. */
export const ROTATION: Record<string, Item> = {
  "hat:beanie": {
    "slot": "eyewear",
    "id": "w_club_shades",
    "name": "Club shades",
    "source": {
      "level": 3
    },
    "look": {
      "kind": "shades",
      "base": "#202938",
      "ink": "#6cabb9"
    }
  },
  "hat:cowboy": {
    "slot": "back",
    "id": "w_musette",
    "name": "Musette",
    "source": {
      "level": 8
    },
    "look": {
      "kind": "musette",
      "base": "#435d54",
      "ink": "#91a38a",
      "accent": "#ead7a5"
    }
  },
  "hat:tophat": {
    "slot": "hands",
    "id": "w_spiked_punk_gloves",
    "name": "Spiked punk gloves",
    "source": {
      "level": 13
    },
    "look": {
      "kind": "spikes",
      "base": "#292a36",
      "ink": "#e7ddd2",
      "accent": "#af454f"
    }
  },
  "hat:pirate": {
    "slot": "feet",
    "id": "w_buckled_pirate_boots",
    "name": "Buckled pirate boots",
    "source": {
      "level": 17
    },
    "look": {
      "kind": "pirate",
      "base": "#513d39",
      "ink": "#d1a753",
      "accent": "#c3b29a"
    }
  },
  "hat:jester": {
    "slot": "hands",
    "id": "w_lobster_claws",
    "name": "Lobster claws",
    "source": {
      "level": 29
    },
    "look": {
      "kind": "claws",
      "base": "#dd493d",
      "ink": "#ff8a63",
      "accent": "#983938"
    }
  },
  "hat:antlers": {
    "slot": "jersey",
    "id": "w_knotted_shirt",
    "name": "Knotted shirt",
    "source": {
      "level": 33
    },
    "look": {
      "cut": "knotted",
      "pattern": "plain",
      "base": "#f2d1a1",
      "ink": "#bb765a"
    }
  },
  "hat:unicorn": {
    "slot": "bottoms",
    "id": "w_tutu",
    "name": "Tutu",
    "source": {
      "level": 36
    },
    "look": {
      "kind": "tutu",
      "base": "#e578ad",
      "ink": "#ffd5e4",
      "accent": "#b44881"
    }
  },
  "hat:cat": {
    "slot": "hands",
    "id": "w_cat_paw_mittens",
    "name": "Cat-paw mittens",
    "source": {
      "level": 44
    },
    "look": {
      "kind": "paws",
      "base": "#d1b697",
      "ink": "#e7969e",
      "accent": "#5c4841"
    }
  },
  "hat:bowler": {
    "slot": "hat",
    "id": "cowboy",
    "name": "Cowboy Hat",
    "source": {
      "pick": 5
    }
  },
  "hat:santa": {
    "slot": "feet",
    "id": "w_canvas_high_tops",
    "name": "Canvas high-tops",
    "source": {
      "pick": 10
    },
    "look": {
      "kind": "hightops",
      "base": "#ad4a4e",
      "ink": "#f2e9cf",
      "accent": "#3b4148"
    }
  },
  "hat:deely": {
    "slot": "eyewear",
    "id": "w_smoked_workshop_goggles",
    "name": "Smoked workshop goggles",
    "source": {
      "pick": 15
    },
    "look": {
      "kind": "goggles",
      "base": "#5e5953",
      "ink": "#b0c1b5",
      "accent": "#d6ba81"
    }
  },
  "hat:duck": {
    "slot": "feet",
    "id": "w_duck_slippers",
    "name": "Duck slippers",
    "source": {
      "pick": 25
    },
    "look": {
      "kind": "ducks",
      "base": "#ffce3d",
      "ink": "#f7852d",
      "accent": "#263241"
    }
  },
  "hat:tiara": {
    "slot": "hands",
    "id": "w_opera_gloves",
    "name": "Opera gloves",
    "source": {
      "pick": 35
    },
    "look": {
      "kind": "opera",
      "base": "#302338",
      "ink": "#d09fc5",
      "accent": "#f2dfc2"
    }
  },
  "hat:football": {
    "slot": "eyewear",
    "id": "w_retro_ski_goggles",
    "name": "Retro ski goggles",
    "source": {
      "pick": 40
    },
    "look": {
      "kind": "ski",
      "base": "#dc5f75",
      "ink": "#eacc79",
      "accent": "#793e62"
    }
  },
  "hat:popcorn": {
    "slot": "back",
    "id": "w_popcorn_bucket_backpack",
    "name": "Popcorn bucket backpack",
    "source": {
      "achievement": "double_feature"
    },
    "look": {
      "kind": "popcorn",
      "base": "#e8e4d2",
      "ink": "#c64e46",
      "accent": "#fff3b8"
    }
  },
  "hat:nightcap": {
    "slot": "eyewear",
    "id": "w_sleep_mask",
    "name": "Sleep mask",
    "source": {
      "achievement": "night_owl"
    },
    "look": {
      "kind": "mask",
      "base": "#33436e",
      "ink": "#d1c3e1",
      "accent": "#e5cf72"
    }
  },
  "hat:hardhat": {
    "slot": "feet",
    "id": "w_mechanic_work_boots",
    "name": "Mechanic work boots",
    "source": {
      "achievement": "diesel"
    },
    "look": {
      "kind": "work",
      "base": "#9c713f",
      "ink": "#d5b275",
      "accent": "#343635"
    }
  },
  "hat:viking": {
    "slot": "bottoms",
    "id": "w_barbarian_fur_briefs",
    "name": "Barbarian fur briefs",
    "source": {
      "achievement": "leg_day"
    },
    "look": {
      "kind": "fur",
      "base": "#99714b",
      "ink": "#eee0b3",
      "accent": "#42352c"
    }
  },
  "hat:souwester": {
    "slot": "jersey",
    "id": "w_storm_oilskin",
    "name": "Storm oilskin",
    "source": {
      "achievement": "storm_chaser"
    },
    "look": {
      "cut": "coat",
      "pattern": "plain",
      "base": "#e4ba3d",
      "ink": "#f7e29b"
    }
  },
  "hat:flowers": {
    "slot": "hands",
    "id": "w_gardener_gloves",
    "name": "Gardener gloves",
    "source": {
      "achievement": "lh_bloom"
    },
    "look": {
      "kind": "work",
      "base": "#eee6c9",
      "ink": "#6c926b",
      "accent": "#dcb84e"
    }
  },
  "hat:captain": {
    "slot": "title",
    "id": "w_harbourmaster",
    "name": "Harbourmaster",
    "source": {
      "achievement": "lh_harbour"
    }
  },
  "hat:welder": {
    "slot": "eyewear",
    "id": "w_welding_goggles",
    "name": "Welding goggles",
    "source": {
      "achievement": "td_boss"
    },
    "look": {
      "kind": "welding",
      "base": "#35443d",
      "ink": "#65e887",
      "accent": "#a7b89a"
    }
  },
  "hat:match": {
    "slot": "hands",
    "id": "w_red_blue_work_gloves",
    "name": "Red/blue work gloves",
    "source": {
      "achievement": "td_matchmaker"
    },
    "look": {
      "kind": "split",
      "base": "#d75344",
      "ink": "#4c8cc8",
      "accent": "#f0d285"
    }
  },
  "hat:spinner": {
    "slot": "back",
    "id": "w_dynamo_coil_pack",
    "name": "Dynamo coil pack",
    "source": {
      "achievement": "td_spin"
    },
    "look": {
      "kind": "coil",
      "base": "#39535e",
      "ink": "#70dcc9",
      "accent": "#c7d49e"
    }
  },
  "hat:lungs": {
    "slot": "back",
    "id": "w_twin_air_tanks",
    "name": "Twin air tanks",
    "source": {
      "achievement": "td_iron_lungs"
    },
    "look": {
      "kind": "tanks",
      "base": "#b3c9d1",
      "ink": "#d7ebdf",
      "accent": "#4f738a"
    }
  },
  "hat:alien": {
    "slot": "bottoms",
    "id": "w_pressure_suit_trousers",
    "name": "Pressure-suit trousers",
    "source": {
      "achievement": "sf_deep"
    },
    "look": {
      "kind": "space",
      "base": "#bbc8c3",
      "ink": "#526f83",
      "accent": "#eb944c"
    }
  },
  "hat:pilot": {
    "slot": "eyewear",
    "id": "w_aviator_goggles",
    "name": "Aviator goggles",
    "source": {
      "achievement": "sf_kills"
    },
    "look": {
      "kind": "aviator",
      "base": "#805a3d",
      "ink": "#aacbd8",
      "accent": "#e0c58d"
    }
  },
  "hat:sweatband": {
    "slot": "feet",
    "id": "w_aerobics_leg_warmers",
    "name": "Aerobics leg warmers",
    "source": {
      "achievement": "hm_spin"
    },
    "look": {
      "kind": "warmers",
      "base": "#d36695",
      "ink": "#f4c989",
      "accent": "#413650",
      "pattern": "stripe"
    }
  },
  "hat:sunhat": {
    "slot": "feet",
    "id": "w_explorer_sandals",
    "name": "Explorer sandals",
    "source": {
      "achievement": "wu_tourist"
    },
    "look": {
      "kind": "sandals",
      "base": "#977144",
      "ink": "#d7b477",
      "accent": "#4e4b3c"
    }
  },
  "hat:bubble": {
    "slot": "eyewear",
    "id": "w_space_bubble",
    "name": "Space Bubble",
    "source": {
      "achievement": "wu_moon"
    },
    "look": {
      "kind": "bubble",
      "base": "#c9f3ff",
      "ink": "#effcff",
      "accent": "#a7bac4"
    }
  },
  "hat:fishing": {
    "slot": "bottoms",
    "id": "w_fly_fishing_waders",
    "name": "Fly-fishing waders",
    "source": {
      "achievement": "ws_salmon"
    },
    "look": {
      "kind": "waders",
      "base": "#5c7564",
      "ink": "#c7c99d",
      "accent": "#374c45"
    }
  },
  "hat:umbrella": {
    "slot": "feet",
    "id": "w_yellow_wellies",
    "name": "Yellow wellies",
    "source": {
      "achievement": "ws_dry_feet"
    },
    "look": {
      "kind": "wellies",
      "base": "#e5b638",
      "ink": "#fff09b",
      "accent": "#8a6a36"
    }
  },
  "hat:beaver": {
    "slot": "hands",
    "id": "w_beaver_work_mitts",
    "name": "Beaver work mitts",
    "source": {
      "achievement": "ws_dam_buster"
    },
    "look": {
      "kind": "mitts",
      "base": "#855e37",
      "ink": "#bd925b",
      "accent": "#413a2b"
    }
  },
  "jersey:vstripes": {
    "slot": "bottoms",
    "id": "w_club_shorts",
    "name": "Club shorts",
    "source": {
      "level": 4
    },
    "look": {
      "kind": "shorts",
      "base": "#243857",
      "ink": "#e7eee6",
      "pattern": "stripe"
    }
  },
  "jersey:sash": {
    "slot": "jersey",
    "id": "w_crop_top",
    "name": "Crop top",
    "source": {
      "level": 9
    },
    "look": {
      "cut": "crop",
      "pattern": "plain",
      "base": "rider",
      "ink": "#fff1d1"
    }
  },
  "jersey:zebra": {
    "slot": "jersey",
    "id": "w_mesh_tank_top",
    "name": "Mesh tank top",
    "source": {
      "level": 23
    },
    "look": {
      "cut": "mesh",
      "pattern": "checker",
      "base": "#2e303d",
      "ink": "#8c718d"
    }
  },
  "jersey:cape": {
    "slot": "back",
    "id": "w_hero_cape",
    "name": "Hero cape",
    "source": {
      "level": 28
    },
    "look": {
      "kind": "cape",
      "base": "#c84d54",
      "ink": "#f1cd75",
      "accent": "#8c394f"
    }
  },
  "jersey:stars": {
    "slot": "eyewear",
    "id": "w_star_specs",
    "name": "Star specs",
    "source": {
      "level": 39
    },
    "look": {
      "kind": "stars",
      "base": "#ffcf48",
      "ink": "#2b7f9e"
    }
  },
  "jersey:argyle": {
    "slot": "jersey",
    "id": "w_racerback_tank",
    "name": "Racerback tank",
    "source": {
      "pick": 5
    },
    "look": {
      "cut": "tank",
      "pattern": "plain",
      "base": "#327a88",
      "ink": "#edddad"
    }
  },
  "jersey:tiedye": {
    "slot": "jersey",
    "id": "w_tie_dye_hoodie",
    "name": "Tie-Dye hoodie",
    "source": {
      "pick": 10
    },
    "look": {
      "cut": "hoodie",
      "pattern": "tiedye",
      "base": "#54ad98",
      "ink": "#ffd17d"
    }
  },
  "jersey:leopard": {
    "slot": "bottoms",
    "id": "w_leopard_booty_shorts",
    "name": "Leopard booty shorts",
    "source": {
      "pick": 15
    },
    "look": {
      "kind": "hotpants",
      "base": "#e9b04f",
      "ink": "#3a2410",
      "pattern": "spots"
    }
  },
  "jersey:bee": {
    "slot": "jersey",
    "id": "w_striped_bikini_top",
    "name": "Striped bikini top",
    "source": {
      "pick": 25
    },
    "look": {
      "cut": "bikini",
      "pattern": "hoops",
      "base": "#d2556e",
      "ink": "#f5d6a1"
    }
  },
  "jersey:pajamas": {
    "slot": "bottoms",
    "id": "w_pyjama_pants",
    "name": "Pyjama pants",
    "source": {
      "pick": 30
    },
    "look": {
      "kind": "pajamas",
      "base": "#9fc9e9",
      "ink": "#f6eedb",
      "pattern": "stripe"
    }
  },
  "jersey:circuit": {
    "slot": "jersey",
    "id": "w_glitter_bikini_top",
    "name": "Glitter bikini top",
    "source": {
      "pick": 35
    },
    "look": {
      "cut": "bikini",
      "pattern": "disco",
      "base": "#8f5d9f",
      "ink": "#e9d389"
    }
  },
  "jersey:neon": {
    "slot": "bottoms",
    "id": "w_aurora_tights",
    "name": "Aurora tights",
    "source": {
      "pick": 40
    },
    "look": {
      "kind": "tights",
      "base": "#164d58",
      "ink": "#5cedcf",
      "pattern": "chevron"
    }
  },
  "jersey:marble": {
    "slot": "bottoms",
    "id": "w_disco_flares",
    "name": "Disco flares",
    "source": {
      "pick": 45
    },
    "look": {
      "kind": "flares",
      "base": "#ac287d",
      "ink": "#ffcf58",
      "accent": "#f778bc"
    }
  },
  "jersey:hoops": {
    "slot": "feet",
    "id": "w_striped_tube_socks",
    "name": "Striped tube socks",
    "source": {
      "achievement": "week_streak_4"
    },
    "look": {
      "kind": "socks",
      "base": "#f1ebd6",
      "ink": "#b94b4d",
      "accent": "#27394c",
      "pattern": "stripe"
    }
  },
  "jersey:tiger": {
    "slot": "bottoms",
    "id": "w_tiger_running_shorts",
    "name": "Tiger running shorts",
    "source": {
      "achievement": "big_day"
    },
    "look": {
      "kind": "shorts",
      "base": "#ed9637",
      "ink": "#302638",
      "pattern": "stripe"
    }
  },
  "jersey:flames": {
    "slot": "feet",
    "id": "w_flame_cycling_shoes",
    "name": "Flame cycling shoes",
    "source": {
      "achievement": "rocket_legs"
    },
    "look": {
      "kind": "flames",
      "base": "#322b34",
      "ink": "#f68c39",
      "accent": "#ffe58b"
    }
  },
  "jersey:skeleton": {
    "slot": "bottoms",
    "id": "w_skeleton_leggings",
    "name": "Skeleton leggings",
    "source": {
      "achievement": "dg_floor20"
    },
    "look": {
      "kind": "tights",
      "base": "#222734",
      "ink": "#f4efdb",
      "pattern": "bones"
    }
  },
  "jersey:lighthouse": {
    "slot": "back",
    "id": "w_lifebuoy",
    "name": "Lifebuoy",
    "source": {
      "achievement": "lh_lifeboat"
    },
    "look": {
      "kind": "lifebuoy",
      "base": "#e8e6d1",
      "ink": "#d05645",
      "accent": "#9a784f"
    }
  },
  "jersey:embers": {
    "slot": "bottoms",
    "id": "w_fireproof_trousers",
    "name": "Fireproof trousers",
    "source": {
      "achievement": "td_kindling"
    },
    "look": {
      "kind": "fireproof",
      "base": "#ae5433",
      "ink": "#ffcb71",
      "accent": "#4b3935",
      "pattern": "patch"
    }
  },
  "jersey:chevrons": {
    "slot": "feet",
    "id": "w_launch_boots",
    "name": "Launch boots",
    "source": {
      "achievement": "cz_launch"
    },
    "look": {
      "kind": "launch",
      "base": "#3459a4",
      "ink": "#f3cd59",
      "accent": "#d6e5d9",
      "pattern": "chevron"
    }
  },
  "jersey:camo": {
    "slot": "bottoms",
    "id": "w_salvager_cargo_shorts",
    "name": "Salvager cargo shorts",
    "source": {
      "achievement": "td_kills"
    },
    "look": {
      "kind": "cargo",
      "base": "#627052",
      "ink": "#b2bd90",
      "accent": "#d1a15c",
      "pattern": "patch"
    }
  },
  "jersey:flightsuit": {
    "slot": "jersey",
    "id": "w_flight_jacket",
    "name": "Flight jacket",
    "source": {
      "achievement": "sf_maw"
    },
    "look": {
      "cut": "jacket",
      "pattern": "suit",
      "base": "#5a6b4a",
      "ink": "#ff8a3c"
    }
  },
  "jersey:hamster": {
    "slot": "bottoms",
    "id": "w_utility_dungarees",
    "name": "Utility dungarees",
    "source": {
      "achievement": "hm_era4"
    },
    "look": {
      "kind": "dungarees",
      "base": "#db8a38",
      "ink": "#ffe4a1",
      "accent": "#754823",
      "pattern": "patch"
    }
  },
  "jersey:hawaiian": {
    "slot": "title",
    "id": "w_globetrotter",
    "name": "Globetrotter",
    "source": {
      "achievement": "wu_globetrotter"
    }
  },
  "jersey:disco": {
    "slot": "jersey",
    "id": "w_sequin_crop_top",
    "name": "Sequin crop top",
    "source": {
      "achievement": "cz_songs"
    },
    "look": {
      "cut": "crop",
      "pattern": "disco",
      "base": "#c0c4d0",
      "ink": "#ffffff"
    }
  },
  "jersey:overalls": {
    "slot": "bottoms",
    "id": "w_millers_trousers",
    "name": "Miller’s trousers",
    "source": {
      "achievement": "ws_miller"
    },
    "look": {
      "kind": "trousers",
      "base": "#3b5b8c",
      "ink": "#d4c498",
      "accent": "#f2e6c8",
      "pattern": "patch"
    }
  },
  "paint:white": {
    "slot": "feet",
    "id": "w_road_shoes",
    "name": "Road shoes",
    "source": {
      "level": 2
    },
    "look": {
      "kind": "road",
      "base": "#f3f1df",
      "ink": "#5a92a5",
      "accent": "#344a62"
    }
  },
  "paint:mint": {
    "slot": "hands",
    "id": "w_club_mitts",
    "name": "Club mitts",
    "source": {
      "level": 11
    },
    "look": {
      "kind": "mitts",
      "base": "#f0eee0",
      "ink": "#487786"
    }
  },
  "paint:pink": {
    "slot": "bottoms",
    "id": "w_booty_shorts",
    "name": "Booty shorts",
    "source": {
      "level": 22
    },
    "look": {
      "kind": "hotpants",
      "base": "#e64d80",
      "ink": "#ffd1a4"
    }
  },
  "paint:olive": {
    "slot": "feet",
    "id": "w_combat_boots",
    "name": "Combat boots",
    "source": {
      "level": 32
    },
    "look": {
      "kind": "combat",
      "base": "#323c3c",
      "ink": "#929e8b",
      "accent": "#242b2e"
    }
  },
  "paint:teal": {
    "slot": "bottoms",
    "id": "w_club_training_tights",
    "name": "Club training tights",
    "source": {
      "achievement": "three_day_week"
    },
    "look": {
      "kind": "tights",
      "base": "#233c59",
      "ink": "#f4eee0",
      "pattern": "stripe"
    }
  },
  "paint:red": {
    "slot": "hands",
    "id": "w_fingerless_leather_gloves",
    "name": "Fingerless leather gloves",
    "source": {
      "achievement": "sessions_10"
    },
    "look": {
      "kind": "fingerless",
      "base": "#644c3c",
      "ink": "#b98a61"
    }
  },
  "paint:blue": {
    "slot": "jersey",
    "id": "w_reflective_wind_vest",
    "name": "Reflective wind vest",
    "source": {
      "achievement": "km_100"
    },
    "look": {
      "cut": "vest",
      "pattern": "plain",
      "base": "#cfe779",
      "ink": "#dae3c5"
    }
  },
  "paint:orange": {
    "slot": "feet",
    "id": "w_track_spikes",
    "name": "Track spikes",
    "source": {
      "achievement": "sprinter_10"
    },
    "look": {
      "kind": "spikes",
      "base": "#d87039",
      "ink": "#f7d477",
      "accent": "#3d454d"
    }
  },
  "paint:stealth": {
    "slot": "back",
    "id": "w_endurance_hydration_pack",
    "name": "Endurance hydration pack",
    "source": {
      "achievement": "ride_60"
    },
    "look": {
      "kind": "hydration",
      "base": "#315a72",
      "ink": "#89c9cf",
      "accent": "#edc776"
    }
  },
  "paint:plasma": {
    "slot": "hands",
    "id": "w_dynamo_gauntlets",
    "name": "Dynamo gauntlets",
    "source": {
      "achievement": "triple_rail"
    },
    "look": {
      "kind": "charged",
      "base": "#7a8b9e",
      "ink": "#4de3bf",
      "accent": "#cedbdc"
    }
  },
  "paint:volt": {
    "slot": "feet",
    "id": "w_insulated_boots",
    "name": "Insulated boots",
    "source": {
      "achievement": "td_surges"
    },
    "look": {
      "kind": "rubber",
      "base": "#3a3c41",
      "ink": "#e6bf43",
      "accent": "#898d7d"
    }
  },
  "paint:bonfire": {
    "slot": "back",
    "id": "w_flamethrower_pack",
    "name": "Flamethrower pack",
    "source": {
      "achievement": "td_bonfire"
    },
    "look": {
      "kind": "flamer",
      "base": "#9c4e35",
      "ink": "#e8ac57",
      "accent": "#4c504b"
    }
  },
  "paint:exposed": {
    "slot": "eyewear",
    "id": "w_weakpoint_goggles",
    "name": "Weakpoint goggles",
    "source": {
      "achievement": "td_exposed"
    },
    "look": {
      "kind": "reticle",
      "base": "#5a3d3f",
      "ink": "#ffbe60",
      "accent": "#f5efe0"
    }
  },
  "paint:neonpink": {
    "slot": "hands",
    "id": "w_neon_flight_gloves",
    "name": "Neon flight gloves",
    "source": {
      "achievement": "sf_combo"
    },
    "look": {
      "kind": "flight",
      "base": "#26243a",
      "ink": "#ed579a",
      "accent": "#7de6de"
    }
  },
  "paint:chrome": {
    "slot": "title",
    "id": "w_spectrum_ace",
    "name": "Spectrum Ace",
    "source": {
      "achievement": "sf_goldens"
    }
  },
  "pet:parrot": {
    "slot": "bottoms",
    "id": "w_riveted_steel_shorts",
    "name": "Riveted steel shorts",
    "source": {
      "achievement": "hours_50"
    },
    "look": {
      "kind": "steel",
      "base": "#7c8b99",
      "ink": "#dde3d9",
      "accent": "#ffd06b"
    }
  },
  "pet:drone": {
    "slot": "back",
    "id": "w_rescue_parachute",
    "name": "Rescue parachute",
    "source": {
      "achievement": "sf_boss"
    },
    "look": {
      "kind": "chute",
      "base": "#6c7c56",
      "ink": "#d5c985",
      "accent": "#a9b185"
    }
  },
  "trail:stars": {
    "slot": "title",
    "id": "w_unbreakable",
    "name": "Unbreakable",
    "source": {
      "achievement": "td_wave50"
    }
  },
  "trail:flames": {
    "slot": "bottoms",
    "id": "w_spotless_overalls",
    "name": "Spotless overalls",
    "source": {
      "achievement": "td_spotless"
    },
    "look": {
      "kind": "dungarees",
      "base": "#eeeee2",
      "ink": "#63a7a6",
      "accent": "#b8c0b3",
      "pattern": "patch"
    }
  },
  "trail:pixels": {
    "slot": "eyewear",
    "id": "w_prism_visor",
    "name": "Prism visor",
    "source": {
      "achievement": "cz_clean"
    },
    "look": {
      "kind": "visor",
      "base": "#e44da5",
      "ink": "#80f4e7",
      "accent": "#923867"
    }
  },
  "ship:lancer": {
    "slot": "bottoms",
    "id": "w_equalizer_hotpants",
    "name": "Equalizer hotpants",
    "source": {
      "achievement": "cz_sets"
    },
    "look": {
      "kind": "hotpants",
      "base": "#241332",
      "ink": "#69e5cc",
      "accent": "#f64d9b",
      "pattern": "eq"
    }
  },
  "ship:manta": {
    "slot": "back",
    "id": "w_speaker_backpack",
    "name": "Speaker backpack",
    "source": {
      "achievement": "cz_launches"
    },
    "look": {
      "kind": "speaker",
      "base": "#332e43",
      "ink": "#e36f9e",
      "accent": "#74dacc"
    }
  },
  "title:t_captain": {
    "slot": "back",
    "id": "w_courier_rolltop",
    "name": "Courier rolltop",
    "source": {
      "level": 27
    },
    "look": {
      "kind": "courier",
      "base": "#b94e2f",
      "ink": "#ed9452",
      "accent": "#f5cb8a"
    }
  },
  "title:t_legend": {
    "slot": "feet",
    "id": "w_winged_boots",
    "name": "Winged boots",
    "source": {
      "level": 38
    },
    "look": {
      "kind": "winged",
      "base": "#327e88",
      "ink": "#fff0b4",
      "accent": "#f7cb60"
    }
  },
  "title:t_wizard": {
    "slot": "back",
    "id": "w_twin_rocket_pack",
    "name": "Twin rocket pack",
    "source": {
      "level": 47
    },
    "look": {
      "kind": "rocket",
      "base": "#dee3d9",
      "ink": "#df5942",
      "accent": "#46677a"
    }
  },
  "title:t_sore": {
    "slot": "bottoms",
    "id": "w_padded_bib_shorts",
    "name": "Padded bib shorts",
    "source": {
      "achievement": "hours_10"
    },
    "look": {
      "kind": "bib",
      "base": "#202c3a",
      "ink": "#6593a1",
      "accent": "#d8e2d2"
    }
  },
  "title:t_halfhour": {
    "slot": "hands",
    "id": "w_wrist_sweatbands",
    "name": "Wrist sweatbands",
    "source": {
      "achievement": "ride_30"
    },
    "look": {
      "kind": "bands",
      "base": "#eee9d8",
      "ink": "#ce5a53",
      "pattern": "stripe"
    }
  },
  "title:t_lamplighter": {
    "slot": "eyewear",
    "id": "w_fresnel_monocle",
    "name": "Fresnel monocle",
    "source": {
      "achievement": "lh_lens"
    },
    "look": {
      "kind": "monocle",
      "base": "#e6bf60",
      "ink": "#b0ede2",
      "accent": "#826746"
    }
  },
  "title:t_clockwork": {
    "slot": "feet",
    "id": "w_clockwork_boots",
    "name": "Clockwork boots",
    "source": {
      "achievement": "lh_clockwork"
    },
    "look": {
      "kind": "clockwork",
      "base": "#bd8d43",
      "ink": "#ffe0a1",
      "accent": "#52616c"
    }
  },
  "title:t_k1": {
    "slot": "back",
    "id": "w_dyson_array",
    "name": "Dyson array",
    "source": {
      "achievement": "hm_k1"
    },
    "look": {
      "kind": "dyson",
      "base": "#6c72ae",
      "ink": "#efd17b",
      "accent": "#a6d2d8"
    }
  },
  "title:t_union": {
    "slot": "hands",
    "id": "w_union_work_gloves",
    "name": "Union work gloves",
    "source": {
      "achievement": "hm_strike"
    },
    "look": {
      "kind": "work",
      "base": "#aa443b",
      "ink": "#f5d49a",
      "accent": "#572f2e"
    }
  },
  "title:t_sharp": {
    "slot": "title",
    "id": "w_maestro",
    "name": "Maestro",
    "source": {
      "achievement": "cz_sharp"
    }
  },
  "title:t_bread": {
    "slot": "back",
    "id": "w_bread_basket",
    "name": "Bread basket",
    "source": {
      "achievement": "ws_breadbasket"
    },
    "look": {
      "kind": "bread",
      "base": "#a87741",
      "ink": "#e4ba75",
      "accent": "#f2dca3"
    }
  },
  "title:t_not_today": {
    "slot": "hands",
    "id": "w_bandage_wraps",
    "name": "Bandage wraps",
    "source": {
      "achievement": "dg_second_wind"
    },
    "look": {
      "kind": "wraps",
      "base": "#eee1c2",
      "ink": "#9d9077"
    }
  },
  "title:t_perfect": {
    "slot": "bottoms",
    "id": "w_censored_blocks",
    "name": "Censored blocks",
    "source": {
      "achievement": "dg_perfect_exposure"
    },
    "look": {
      "kind": "censor",
      "base": "#f1c27d",
      "ink": "#d9a471",
      "accent": "#f7d6a8"
    }
  },
  "title:t_arsenal": {
    "slot": "back",
    "id": "w_weapon_rack",
    "name": "Weapon rack",
    "source": {
      "achievement": "dg_full_arsenal"
    },
    "look": {
      "kind": "arsenal",
      "base": "#5c493b",
      "ink": "#c5d0d1",
      "accent": "#caaa6b"
    }
  },
  "title:t_spin_doctor": {
    "slot": "feet",
    "id": "w_windstep_boots",
    "name": "Windstep boots",
    "source": {
      "achievement": "dg_spin_doctor"
    },
    "look": {
      "kind": "wind",
      "base": "#658c82",
      "ink": "#e9e1bc",
      "accent": "#9dccb2"
    }
  },
  "title:t_vanguard": {
    "slot": "hands",
    "id": "w_iron_gauntlets",
    "name": "Iron gauntlets",
    "source": {
      "achievement": "dg_master_vanguard"
    },
    "look": {
      "kind": "gauntlets",
      "base": "#8794a6",
      "ink": "#e1dfcf",
      "accent": "#525e74"
    }
  },
  "title:t_ranger": {
    "slot": "bottoms",
    "id": "w_ranger_riding_chaps",
    "name": "Ranger riding chaps",
    "source": {
      "achievement": "dg_master_ranger"
    },
    "look": {
      "kind": "chaps",
      "base": "#825b3c",
      "ink": "#658366",
      "accent": "#ddc495"
    }
  },
  "title:t_skirmisher": {
    "slot": "back",
    "id": "w_ragged_scarf",
    "name": "Ragged scarf",
    "source": {
      "achievement": "dg_master_skirmisher"
    },
    "look": {
      "kind": "scarf",
      "base": "#918654",
      "ink": "#c9c391",
      "accent": "#655d3c"
    }
  },
  "title:t_arcanist": {
    "slot": "eyewear",
    "id": "w_rune_spectacles",
    "name": "Rune spectacles",
    "source": {
      "achievement": "dg_master_arcanist"
    },
    "look": {
      "kind": "runes",
      "base": "#9a72c1",
      "ink": "#e5d5ff",
      "accent": "#4f4778"
    }
  }
};
