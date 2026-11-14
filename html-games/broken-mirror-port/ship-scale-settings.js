/* Full atlas reference frames and compact gameplay frames. Danube stays fixed.
   Physical mass and inertia retain their pre-scale gameplay values. */
(()=>{
  "use strict";
  const settings={
  "version": 1,
  "anchor": {
    "meters": 23.1,
    "name": "Danube runabout",
    "id": 7,
    "units": 10.9001953125,
    "widthUnits": 7.1982421875,
    "frameUnits": 11.7
  },
  "unitsPerMeter": 0.4718699269480519,
  "ships": {
    "7": {
      "dimensions": {
        "width": 7.1982421875,
        "height": 11.7
      },
      "physical": {
        "mass": 0.5,
        "inertia": 5.253991355556964
      },
      "meters": 23.1,
      "status": "official",
      "bounds": {
        "x": 0,
        "y": 17,
        "width": 315,
        "height": 477
      },
      "artwork": {
        "width": 315,
        "height": 512
      }
    },
    "426": {
      "dimensions": {
        "width": 96.66128981923805,
        "height": 144.99193472885707
      },
      "physical": {
        "mass": 37.037037037037045,
        "inertia": 22683.127572016467
      },
      "meters": 288.6,
      "status": "museum",
      "bounds": {
        "x": 51,
        "y": 15,
        "width": 283,
        "height": 541
      },
      "artwork": {
        "width": 384,
        "height": 576
      }
    },
    "439": {
      "dimensions": {
        "width": 103.58488636363637,
        "height": 165.7358181818182
      },
      "physical": {
        "mass": 19.245103550275562,
        "inertia": 7915.81341751255
      },
      "meters": 343,
      "status": "official",
      "bounds": {
        "x": 53,
        "y": 6,
        "width": 214,
        "height": 500
      },
      "artwork": {
        "width": 320,
        "height": 512
      }
    },
    "440": {
      "dimensions": {
        "width": 269.759603025696,
        "height": 305.56839988751403
      },
      "physical": {
        "mass": 115.33786494468859,
        "inertia": 126750.7654181062
      },
      "meters": 642.51,
      "status": "licensed",
      "bounds": {
        "x": 2,
        "y": 2,
        "width": 448,
        "height": 508
      },
      "artwork": {
        "width": 452,
        "height": 512
      }
    },
    "38": {
      "dimensions": {
        "width": 129.29235998376623,
        "height": 324.49847211611916
      },
      "physical": {
        "mass": 38.893792942945836,
        "inertia": 32451.59199522473
      },
      "meters": 685,
      "status": "official",
      "bounds": {
        "x": 1,
        "y": 1,
        "width": 202,
        "height": 510
      },
      "artwork": {
        "width": 204,
        "height": 512
      }
    },
    "436": {
      "dimensions": {
        "width": 3.005966996173469,
        "height": 4.513358070500927
      },
      "physical": {
        "mass": 0.5,
        "inertia": 5.482446040012885
      },
      "meters": 8.5,
      "status": "provisional",
      "bounds": {
        "x": 37,
        "y": 12,
        "width": 267,
        "height": 455
      },
      "artwork": {
        "width": 341,
        "height": 512
      }
    },
    "437": {
      "dimensions": {
        "width": 7.26408386515307,
        "height": 10.417957812208325
      },
      "physical": {
        "mass": 0.5,
        "inertia": 5.628359023481144
      },
      "meters": 21,
      "status": "licensed",
      "bounds": {
        "x": 10,
        "y": 11,
        "width": 344,
        "height": 487
      },
      "artwork": {
        "width": 357,
        "height": 512
      }
    },
    "34": {
      "dimensions": {
        "width": 68.26918254505505,
        "height": 80.5387591314935
      },
      "physical": {
        "mass": 0.6454481534868188,
        "inertia": 29.981409617339796
      },
      "meters": 170.68,
      "status": "official",
      "bounds": {
        "x": 23,
        "y": 0,
        "width": 386,
        "height": 512
      },
      "artwork": {
        "width": 434,
        "height": 512
      }
    },
    "442": {
      "dimensions": {
        "width": 77.10810204881327,
        "height": 83.64268696820422
      },
      "physical": {
        "mass": 0.7329895443766558,
        "inertia": 34.04775372966122
      },
      "meters": 170.68,
      "status": "official",
      "bounds": {
        "x": 12,
        "y": 8,
        "width": 448,
        "height": 493
      },
      "artwork": {
        "width": 472,
        "height": 512
      }
    },
    "443": {
      "dimensions": {
        "width": 77.10810204881327,
        "height": 83.64268696820422
      },
      "physical": {
        "mass": 0.7329895443766558,
        "inertia": 34.04775372966122
      },
      "meters": 170.68,
      "status": "official",
      "bounds": {
        "x": 12,
        "y": 8,
        "width": 448,
        "height": 493
      },
      "artwork": {
        "width": 472,
        "height": 512
      }
    },
    "444": {
      "dimensions": {
        "width": 77.42852249836673,
        "height": 83.8126924295217
      },
      "physical": {
        "mass": 0.7338321950708813,
        "inertia": 34.08689530205775
      },
      "meters": 170.68,
      "status": "official",
      "bounds": {
        "x": 13,
        "y": 8,
        "width": 447,
        "height": 492
      },
      "artwork": {
        "width": 473,
        "height": 512
      }
    },
    "14": {
      "dimensions": {
        "width": 67.93268030340022,
        "height": 99.0926846590909
      },
      "physical": {
        "mass": 39.64900218168809,
        "inertia": 25009.32465662882
      },
      "meters": 210,
      "status": "licensed",
      "bounds": {
        "x": 28,
        "y": 0,
        "width": 296,
        "height": 512
      },
      "artwork": {
        "width": 351,
        "height": 512
      }
    },
    "5": {
      "dimensions": {
        "width": 66.37948437700912,
        "height": 132.75896875401824
      },
      "physical": {
        "mass": 1.2584702041118694,
        "inertia": 105.3339359486402
      },
      "meters": 222,
      "status": "official",
      "bounds": {
        "x": 0,
        "y": 54,
        "width": 256,
        "height": 404
      },
      "artwork": {
        "width": 256,
        "height": 512
      }
    },
    "6": {
      "dimensions": {
        "width": 96.94140365355608,
        "height": 106.05555271500153
      },
      "physical": {
        "mass": 1.419998500903397,
        "inertia": 86.61480016432274
      },
      "meters": 223,
      "status": "licensed",
      "bounds": {
        "x": 2,
        "y": 2,
        "width": 464,
        "height": 508
      },
      "artwork": {
        "width": 468,
        "height": 512
      }
    },
    "434": {
      "dimensions": {
        "width": 146.9173394173394,
        "height": 110.47495249155405
      },
      "physical": {
        "mass": 27.495108603924066,
        "inertia": 11245.446796707409
      },
      "meters": 225,
      "status": "licensed",
      "bounds": {
        "x": 141,
        "y": 9,
        "width": 230,
        "height": 370
      },
      "artwork": {
        "width": 512,
        "height": 385
      }
    },
    "435": {
      "dimensions": {
        "width": 147.7158032185206,
        "height": 111.07535984205163
      },
      "physical": {
        "mass": 27.52363656817116,
        "inertia": 11265.117194692379
      },
      "meters": 225,
      "status": "licensed",
      "bounds": {
        "x": 142,
        "y": 10,
        "width": 228,
        "height": 368
      },
      "artwork": {
        "width": 512,
        "height": 385
      }
    },
    "3": {
      "dimensions": {
        "width": 98.95527613636362,
        "height": 167.76523636363635
      },
      "physical": {
        "mass": 8.11806802134785,
        "inertia": 1949.793613758396
      },
      "meters": 277.76,
      "status": "licensed",
      "bounds": {
        "x": 0,
        "y": 56,
        "width": 302,
        "height": 400
      },
      "artwork": {
        "width": 302,
        "height": 512
      }
    },
    "427": {
      "dimensions": {
        "width": 96.84029220779219,
        "height": 145.2604383116883
      },
      "physical": {
        "mass": 37.037037037037045,
        "inertia": 22683.127572016467
      },
      "meters": 288.6,
      "status": "museum",
      "bounds": {
        "x": 51,
        "y": 15,
        "width": 282,
        "height": 540
      },
      "artwork": {
        "width": 384,
        "height": 576
      }
    },
    "58": {
      "dimensions": {
        "width": 63.609552357091715,
        "height": 152.18734021883625
      },
      "physical": {
        "mass": 7.060672361525183,
        "inertia": 2099.1642984861305
      },
      "meters": 320,
      "status": "licensed",
      "bounds": {
        "x": 2,
        "y": 2,
        "width": 210,
        "height": 508
      },
      "artwork": {
        "width": 214,
        "height": 512
      }
    },
    "46": {
      "dimensions": {
        "width": 123.33896549041371,
        "height": 162.33817565833374
      },
      "physical": {
        "mass": 59.4879542471371,
        "inertia": 46592.555653833035
      },
      "meters": 340,
      "status": "licensed",
      "bounds": {
        "x": 2,
        "y": 3,
        "width": 386,
        "height": 506
      },
      "artwork": {
        "width": 389,
        "height": 512
      }
    },
    "36": {
      "dimensions": {
        "width": 70.90934939553938,
        "height": 162.80532237899624
      },
      "physical": {
        "mass": 9.784704428231391,
        "inertia": 3571.7493749226833
      },
      "meters": 343,
      "status": "official",
      "bounds": {
        "x": 2,
        "y": 2,
        "width": 219,
        "height": 509
      },
      "artwork": {
        "width": 223,
        "height": 512
      }
    },
    "438": {
      "dimensions": {
        "width": 70.90934939553938,
        "height": 162.80532237899624
      },
      "physical": {
        "mass": 19.310724653139804,
        "inertia": 7949.646332715121
      },
      "meters": 343,
      "status": "official",
      "bounds": {
        "x": 2,
        "y": 2,
        "width": 219,
        "height": 509
      },
      "artwork": {
        "width": 223,
        "height": 512
      }
    },
    "1": {
      "dimensions": {
        "width": 135.47233386573103,
        "height": 173.40458734813572
      },
      "physical": {
        "mass": 13.112785157579872,
        "inertia": 3698.176811056106
      },
      "meters": 356,
      "status": "licensed",
      "bounds": {
        "x": 1,
        "y": 8,
        "width": 399,
        "height": 496
      },
      "artwork": {
        "width": 400,
        "height": 512
      }
    },
    "37": {
      "dimensions": {
        "width": 108.86310757646261,
        "height": 217.72621515292522
      },
      "physical": {
        "mass": 11.471039322310087,
        "inertia": 4693.720367461667
      },
      "meters": 415,
      "status": "licensed",
      "bounds": {
        "x": 57,
        "y": 32,
        "width": 398,
        "height": 921
      },
      "artwork": {
        "width": 512,
        "height": 1024
      }
    },
    "4": {
      "dimensions": {
        "width": 218.37638435184448,
        "height": 208.99302408672617
      },
      "physical": {
        "mass": 67.97807579189957,
        "inertia": 51648.06092561764
      },
      "meters": 442,
      "status": "official",
      "bounds": {
        "x": 2,
        "y": 0,
        "width": 508,
        "height": 489
      },
      "artwork": {
        "width": 512,
        "height": 490
      }
    },
    "33": {
      "dimensions": {
        "width": 157.77020935653914,
        "height": 232.79062590936033
      },
      "physical": {
        "mass": 24.998857041936805,
        "inertia": 11669.816186380047
      },
      "meters": 464.43,
      "status": "official",
      "bounds": {
        "x": 0,
        "y": 15,
        "width": 345,
        "height": 482
      },
      "artwork": {
        "width": 347,
        "height": 512
      }
    },
    "2": {
      "dimensions": {
        "width": 106.4375920414158,
        "height": 273.8494830412306
      },
      "physical": {
        "mass": 18.227873719639437,
        "inertia": 10283.651887323527
      },
      "meters": 467,
      "status": "licensed",
      "bounds": {
        "x": 1,
        "y": 50,
        "width": 198,
        "height": 412
      },
      "artwork": {
        "width": 199,
        "height": 512
      }
    },
    "441": {
      "dimensions": {
        "width": 94.2517540229913,
        "height": 226.55820685338756
      },
      "physical": {
        "mass": 20.22602432801544,
        "inertia": 11551.409806428273
      },
      "meters": 467,
      "status": "licensed",
      "bounds": {
        "x": 10,
        "y": 8,
        "width": 193,
        "height": 498
      },
      "artwork": {
        "width": 213,
        "height": 512
      }
    },
    "15": {
      "dimensions": {
        "width": 189.65707797792803,
        "height": 288.1436911712141
      },
      "physical": {
        "mass": 50.38413472023392,
        "inertia": 38168.9575319119
      },
      "meters": 520,
      "status": "licensed",
      "bounds": {
        "x": 0,
        "y": 38,
        "width": 337,
        "height": 436
      },
      "artwork": {
        "width": 337,
        "height": 512
      }
    },
    "433": {
      "dimensions": {
        "width": 138.11716360772286,
        "height": 257.14904642601493
      },
      "physical": {
        "mass": 70.77753821476108,
        "inertia": 66752.59769463535
      },
      "meters": 540.7,
      "status": "provisional",
      "bounds": {
        "x": 2,
        "y": 2,
        "width": 271,
        "height": 508
      },
      "artwork": {
        "width": 275,
        "height": 512
      }
    },
    "445": {
      "dimensions": {
        "width": 174.70434477866826,
        "height": 262.31268189641685
      },
      "physical": {
        "mass": 70.77753821476108,
        "inertia": 66752.59769463535
      },
      "meters": 540.7,
      "status": "provisional",
      "bounds": {
        "x": 39,
        "y": 7,
        "width": 263,
        "height": 498
      },
      "artwork": {
        "width": 341,
        "height": 512
      }
    },
    "49": {
      "dimensions": {
        "width": 268.53021466799066,
        "height": 304.8502658758564
      },
      "physical": {
        "mass": 82.92480320531374,
        "inertia": 80071.4342765204
      },
      "meters": 641,
      "status": "provisional",
      "bounds": {
        "x": 2,
        "y": 2,
        "width": 447,
        "height": 508
      },
      "artwork": {
        "width": 451,
        "height": 512
      }
    },
    "35": {
      "dimensions": {
        "width": 258.04084268973213,
        "height": 344.9527714285714
      },
      "physical": {
        "mass": 74.62169803207007,
        "inertia": 68502.50997460836
      },
      "meters": 642.51,
      "status": "licensed",
      "bounds": {
        "x": 18,
        "y": 33,
        "width": 365,
        "height": 450
      },
      "artwork": {
        "width": 383,
        "height": 512
      }
    }
  },
  "unreferencedIds": [
    11,
    47,
    8,
    57,
    13,
    9,
    45,
    10,
    416,
    56,
    12,
    60
  ],
  "gameplay": {
    "mode": "compact",
    "anchorId": 7,
    "anchorFrameHeight": 11.7,
    "maxFrameHeight": 175,
    "compression": 0.4900184304543776,
    "keepSmallerCraft": true
  },
  "gameplayShips": {
    "1": {
      "dimensions": {
        "width": 71.04549069500491,
        "height": 90.93822808960628
      },
      "physical": {
        "mass": 13.112785157579872,
        "inertia": 3698.176811056106
      },
      "baseDimensions": {
        "width": 135.47233386573103,
        "height": 173.40458734813572
      }
    },
    "2": {
      "dimensions": {
        "width": 54.47550305983157,
        "height": 140.15807822429028
      },
      "physical": {
        "mass": 18.227873719639437,
        "inertia": 10283.651887323527
      },
      "baseDimensions": {
        "width": 106.4375920414158,
        "height": 273.8494830412306
      }
    },
    "3": {
      "dimensions": {
        "width": 52.00937956203703,
        "height": 88.17484217140054
      },
      "physical": {
        "mass": 8.11806802134785,
        "inertia": 1949.793613758396
      },
      "baseDimensions": {
        "width": 98.95527613636362,
        "height": 167.76523636363635
      }
    },
    "4": {
      "dimensions": {
        "width": 113.24313391289498,
        "height": 108.37721800257528
      },
      "physical": {
        "mass": 67.97807579189957,
        "inertia": 51648.06092561764
      },
      "baseDimensions": {
        "width": 218.37638435184448,
        "height": 208.99302408672617
      }
    },
    "5": {
      "dimensions": {
        "width": 35.51056293063478,
        "height": 71.02112586126955
      },
      "physical": {
        "mass": 1.2584702041118694,
        "inertia": 105.3339359486402
      },
      "baseDimensions": {
        "width": 66.37948437700912,
        "height": 132.75896875401824
      }
    },
    "6": {
      "dimensions": {
        "width": 52.957088296789514,
        "height": 57.93595984606033
      },
      "physical": {
        "mass": 1.419998500903397,
        "inertia": 86.61480016432274
      },
      "baseDimensions": {
        "width": 96.94140365355608,
        "height": 106.05555271500153
      }
    },
    "7": {
      "dimensions": {
        "width": 7.1982421875,
        "height": 11.7
      },
      "physical": {
        "mass": 0.5,
        "inertia": 5.253991355556964
      },
      "baseDimensions": {
        "width": 7.1982421875,
        "height": 11.7
      }
    },
    "8": {
      "dimensions": {
        "width": 29.9154454484409,
        "height": 47.128332521851505
      },
      "physical": {
        "mass": 20.395346246234222,
        "inertia": 8640.992415509329
      },
      "baseDimensions": {
        "width": 53.3203125,
        "height": 84
      }
    },
    "9": {
      "dimensions": {
        "width": 32.58576213520612,
        "height": 53.474071196235684
      },
      "physical": {
        "mass": 29.494668151901852,
        "inertia": 16393.03058539348
      },
      "baseDimensions": {
        "width": 59.078906249999996,
        "height": 96.94999999999999
      }
    },
    "10": {
      "dimensions": {
        "width": 40.84998789755894,
        "height": 55.1852079249345
      },
      "physical": {
        "mass": 12.499130672448924,
        "inertia": 6477.0742761377405
      },
      "baseDimensions": {
        "width": 74.35060956700028,
        "height": 100.44198442824312
      }
    },
    "11": {
      "dimensions": {
        "width": 23.172979267454863,
        "height": 30.737216023152566
      },
      "physical": {
        "mass": 5.75324170202348,
        "inertia": 953.0251130000394
      },
      "baseDimensions": {
        "width": 38.1099609375,
        "height": 50.55
      }
    },
    "12": {
      "dimensions": {
        "width": 20.24444220072065,
        "height": 56.027861658210654
      },
      "physical": {
        "mass": 15.75756489869495,
        "inertia": 8580.478762776289
      },
      "baseDimensions": {
        "width": 36.91386705095691,
        "height": 102.16162124372939
      }
    },
    "13": {
      "dimensions": {
        "width": 33.822139572336205,
        "height": 51.53849839594089
      },
      "physical": {
        "mass": 30.932790138791198,
        "inertia": 16561.91661964802
      },
      "baseDimensions": {
        "width": 61.03125,
        "height": 93
      }
    },
    "14": {
      "dimensions": {
        "width": 37.37877575315347,
        "height": 54.52402616984209
      },
      "physical": {
        "mass": 39.64900218168809,
        "inertia": 25009.32465662882
      },
      "baseDimensions": {
        "width": 67.93268030340022,
        "height": 99.0926846590909
      }
    },
    "15": {
      "dimensions": {
        "width": 96.8628197896856,
        "height": 147.162503656733
      },
      "physical": {
        "mass": 50.38413472023392,
        "inertia": 38168.9575319119
      },
      "baseDimensions": {
        "width": 189.65707797792803,
        "height": 288.1436911712141
      }
    },
    "16": {
      "dimensions": {
        "width": 17.29908685004131,
        "height": 20.31452400738796
      },
      "physical": {
        "mass": 1.3421811464871236,
        "inertia": 79.80757562904246
      },
      "baseDimensions": {
        "width": 24.93375,
        "height": 29.28
      }
    },
    "17": {
      "dimensions": {
        "width": 39.929091753510995,
        "height": 46.148295660942736
      },
      "physical": {
        "mass": 30.193630045191888,
        "inertia": 14218.729261122462
      },
      "baseDimensions": {
        "width": 70.94921875,
        "height": 82
      }
    },
    "18": {
      "dimensions": {
        "width": 8.180859374999999,
        "height": 11.7
      },
      "physical": {
        "mass": 0.5,
        "inertia": 5.6365080216236105
      },
      "baseDimensions": {
        "width": 8.180859374999999,
        "height": 11.7
      }
    },
    "19": {
      "dimensions": {
        "width": 38.04494942618818,
        "height": 32.91779803867455
      },
      "physical": {
        "mass": 14.065673918438266,
        "inertia": 3701.8963840331976
      },
      "baseDimensions": {
        "width": 63.56659142212189,
        "height": 55
      }
    },
    "20": {
      "dimensions": {
        "width": 9.702393804474685,
        "height": 21.59837229517843
      },
      "physical": {
        "mass": 0.6650158343040063,
        "inertia": 39.66701438934112
      },
      "baseDimensions": {
        "width": 14.330078125,
        "height": 31.9
      }
    },
    "21": {
      "dimensions": {
        "width": 23.3614973854949,
        "height": 42.718166647762104
      },
      "physical": {
        "mass": 11.608845202254418,
        "inertia": 3724.906189879334
      },
      "baseDimensions": {
        "width": 41.015625,
        "height": 75
      }
    },
    "22": {
      "dimensions": {
        "width": 62.55209814682426,
        "height": 36.40727587451881
      },
      "physical": {
        "mass": 36.73426939781788,
        "inertia": 18954.71089558487
      },
      "baseDimensions": {
        "width": 106.73158097733491,
        "height": 62.121115490714466
      }
    },
    "23": {
      "dimensions": {
        "width": 16.062938163420164,
        "height": 16.992199048907278
      },
      "physical": {
        "mass": 0.7123341736404732,
        "inertia": 32.16901128160377
      },
      "baseDimensions": {
        "width": 21.26953125,
        "height": 22.5
      }
    },
    "24": {
      "dimensions": {
        "width": 14.491926312371335,
        "height": 19.17278106442926
      },
      "physical": {
        "mass": 0.8752073154253328,
        "inertia": 45.510780402117305
      },
      "baseDimensions": {
        "width": 20.37041015625,
        "height": 26.95
      }
    },
    "25": {
      "dimensions": {
        "width": 13.19226114275376,
        "height": 18.354450285570447
      },
      "physical": {
        "mass": 0.6698400641652131,
        "inertia": 34.831683336591084
      },
      "baseDimensions": {
        "width": 18.17,
        "height": 25.28
      }
    },
    "26": {
      "dimensions": {
        "width": 32.29738518116679,
        "height": 66.14504485102958
      },
      "physical": {
        "mass": 42.99914705273492,
        "inertia": 35856.11177822666
      },
      "baseDimensions": {
        "width": 59.964920556845385,
        "height": 122.80815730041935
      }
    },
    "27": {
      "dimensions": {
        "width": 56.09403314489574,
        "height": 66.94672487222988
      },
      "physical": {
        "mass": 100.57218035107553,
        "inertia": 106983.72770198277
      },
      "baseDimensions": {
        "width": 104.27060961317369,
        "height": 124.44417744043108
      }
    },
    "28": {
      "dimensions": {
        "width": 63.554285868413054,
        "height": 44.43834832205444
      },
      "physical": {
        "mass": 56.31651948970011,
        "inertia": 37320.326414158684
      },
      "baseDimensions": {
        "width": 112.28309138821693,
        "height": 78.5104428066048
      }
    },
    "29": {
      "dimensions": {
        "width": 10.826166948971279,
        "height": 13.292559898976727
      },
      "physical": {
        "mass": 0.5,
        "inertia": 10.189621829319117
      },
      "baseDimensions": {
        "width": 12.17607421875,
        "height": 14.95
      }
    },
    "30": {
      "dimensions": {
        "width": 23.043987416599595,
        "height": 18.90327092767935
      },
      "physical": {
        "mass": 1.6850621009286633,
        "inertia": 111.1008269216068
      },
      "baseDimensions": {
        "width": 32.182857142857145,
        "height": 26.4
      }
    },
    "31": {
      "dimensions": {
        "width": 31.360068100919158,
        "height": 61.28379720484965
      },
      "physical": {
        "mass": 35.831008727799876,
        "inertia": 25555.750781342012
      },
      "baseDimensions": {
        "width": 57.76671020020094,
        "height": 112.88761687978199
      }
    },
    "32": {
      "dimensions": {
        "width": 32.33885853871236,
        "height": 62.481115365361234
      },
      "physical": {
        "mass": 38.8665079237332,
        "inertia": 29023.866741429476
      },
      "baseDimensions": {
        "width": 59.692818999388464,
        "height": 115.33103142523356
      }
    },
    "33": {
      "dimensions": {
        "width": 81.35420523283088,
        "height": 120.03848149628071
      },
      "physical": {
        "mass": 24.998857041936805,
        "inertia": 11669.816186380047
      },
      "baseDimensions": {
        "width": 157.77020935653914,
        "height": 232.79062590936033
      }
    },
    "34": {
      "dimensions": {
        "width": 38.51093973741009,
        "height": 45.4322607040414
      },
      "physical": {
        "mass": 0.6454481534868188,
        "inertia": 29.981409617339796
      },
      "baseDimensions": {
        "width": 68.26918254505505,
        "height": 80.5387591314935
      }
    },
    "35": {
      "dimensions": {
        "width": 130.908203125,
        "height": 175.0
      },
      "physical": {
        "mass": 74.62169803207007,
        "inertia": 68502.50997460836
      },
      "baseDimensions": {
        "width": 258.04084268973213,
        "height": 344.9527714285714
      }
    },
    "36": {
      "dimensions": {
        "width": 37.34570237874462,
        "height": 85.74439290545848
      },
      "physical": {
        "mass": 9.784704428231391,
        "inertia": 3571.7493749226833
      },
      "baseDimensions": {
        "width": 70.90934939553938,
        "height": 162.80532237899624
      }
    },
    "37": {
      "dimensions": {
        "width": 45.0,
        "height": 90.0
      },
      "physical": {
        "mass": 11.471039322310087,
        "inertia": 4693.720367461667
      },
      "baseDimensions": {
        "width": 126.91509123787603,
        "height": 253.83018247575205
      }
    },
    "38": {
      "dimensions": {
        "width": 65.73302995389277,
        "height": 164.9770163548681
      },
      "physical": {
        "mass": 38.893792942945836,
        "inertia": 32451.59199522473
      },
      "baseDimensions": {
        "width": 129.29235998376623,
        "height": 324.49847211611916
      }
    },
    "39": {
      "dimensions": {
        "width": 16.564628990502403,
        "height": 14.591108739680829
      },
      "physical": {
        "mass": 0.5,
        "inertia": 16.921088
      },
      "baseDimensions": {
        "width": 19.98048780487805,
        "height": 17.6
      }
    },
    "40": {
      "dimensions": {
        "width": 33.544312245401194,
        "height": 48.10836938276026
      },
      "physical": {
        "mass": 25.197987772876626,
        "inertia": 11638.560332329722
      },
      "baseDimensions": {
        "width": 59.96484375,
        "height": 86
      }
    },
    "41": {
      "dimensions": {
        "width": 34.39108551492683,
        "height": 29.487669025493904
      },
      "physical": {
        "mass": 9.477744517324094,
        "inertia": 1915.3102342341444
      },
      "baseDimensions": {
        "width": 55.981776765375855,
        "height": 48
      }
    },
    "42": {
      "dimensions": {
        "width": 45.06429284959965,
        "height": 68.46563186645407
      },
      "physical": {
        "mass": 75.38619373107986,
        "inertia": 74709.12526718037
      },
      "baseDimensions": {
        "width": 83.94977449537348,
        "height": 127.54387104341609
      }
    },
    "43": {
      "dimensions": {
        "width": 41.538229248362015,
        "height": 57.7923189542428
      },
      "physical": {
        "mass": 49.04943827330869,
        "inertia": 34745.99911146567
      },
      "baseDimensions": {
        "width": 76.01673870189738,
        "height": 105.7624190635094
      }
    },
    "44": {
      "dimensions": {
        "width": 71.36872831328525,
        "height": 70.11419988590329
      },
      "physical": {
        "mass": 156.75678004493741,
        "inertia": 210456.5794441485
      },
      "baseDimensions": {
        "width": 133.2504623138453,
        "height": 130.90816903098477
      }
    },
    "45": {
      "dimensions": {
        "width": 38.518079004448275,
        "height": 54.47860897866717
      },
      "physical": {
        "mass": 39.24972538953387,
        "inertia": 24176.362733548514
      },
      "baseDimensions": {
        "width": 69.99609375,
        "height": 99
      }
    },
    "46": {
      "dimensions": {
        "width": 64.97172393479362,
        "height": 85.51548240260753
      },
      "physical": {
        "mass": 59.4879542471371,
        "inertia": 46592.555653833035
      },
      "baseDimensions": {
        "width": 123.33896549041371,
        "height": 162.33817565833374
      }
    },
    "47": {
      "dimensions": {
        "width": 21.510245570622118,
        "height": 41.248111356398965
      },
      "physical": {
        "mass": 9.563845778577571,
        "inertia": 2789.275442214636
      },
      "baseDimensions": {
        "width": 37.546875,
        "height": 72
      }
    },
    "48": {
      "dimensions": {
        "width": 50.53793437871748,
        "height": 66.8615565940655
      },
      "physical": {
        "mass": 85.80990415686988,
        "inertia": 86018.63651487342
      },
      "baseDimensions": {
        "width": 93.93092507998848,
        "height": 124.27037116525608
      }
    },
    "49": {
      "dimensions": {
        "width": 136.84065226654013,
        "height": 155.34903317177063
      },
      "physical": {
        "mass": 82.92480320531374,
        "inertia": 80071.4342765204
      },
      "baseDimensions": {
        "width": 268.53021466799066,
        "height": 304.8502658758564
      }
    },
    "50": {
      "dimensions": {
        "width": 26.738387754077564,
        "height": 46.56481132682896
      },
      "physical": {
        "mass": 16.837077729311165,
        "inertia": 6694.970046053338
      },
      "baseDimensions": {
        "width": 47.574023437499996,
        "height": 82.85
      }
    },
    "51": {
      "dimensions": {
        "width": 50.15817436418138,
        "height": 68.66573602797023
      },
      "physical": {
        "mass": 88.98548663075327,
        "inertia": 92977.04861112988
      },
      "baseDimensions": {
        "width": 93.46510662069035,
        "height": 127.95223152351193
      }
    },
    "52": {
      "dimensions": {
        "width": 21.415994218559632,
        "height": 50.06844310457777
      },
      "physical": {
        "mass": 13.87592307478525,
        "inertia": 6034.199534465069
      },
      "baseDimensions": {
        "width": 38.49609375,
        "height": 90
      }
    },
    "53": {
      "dimensions": {
        "width": 71.4446946175917,
        "height": 42.978449105895
      },
      "physical": {
        "mass": 62.83919388810311,
        "inertia": 45981.02251257104
      },
      "baseDimensions": {
        "width": 125.55830642888637,
        "height": 75.53116871112695
      }
    },
    "54": {
      "dimensions": {
        "width": 35.75107993601069,
        "height": 54.96862740912154
      },
      "physical": {
        "mass": 35.68901265157025,
        "inertia": 21636.439005885914
      },
      "baseDimensions": {
        "width": 65.0390625,
        "height": 100
      }
    },
    "55": {
      "dimensions": {
        "width": 33.99670041148347,
        "height": 55.6112160085608
      },
      "physical": {
        "mass": 33.818868547026256,
        "inertia": 20549.49736001648
      },
      "baseDimensions": {
        "width": 61.934481292900955,
        "height": 101.31135598071977
      }
    },
    "56": {
      "dimensions": {
        "width": 27.577920862871814,
        "height": 55.59013969208806
      },
      "physical": {
        "mass": 24.691068912712765,
        "inertia": 14056.541986722139
      },
      "baseDimensions": {
        "width": 50.2385928823601,
        "height": 101.26834470774949
      }
    },
    "57": {
      "dimensions": {
        "width": 26.16125089249472,
        "height": 48.181872147328406
      },
      "physical": {
        "mass": 17.40608989712164,
        "inertia": 7353.22512332134
      },
      "baseDimensions": {
        "width": 46.7767578125,
        "height": 86.15
      }
    },
    "58": {
      "dimensions": {
        "width": 33.6637824099361,
        "height": 80.5413859527443
      },
      "physical": {
        "mass": 7.060672361525183,
        "inertia": 2099.1642984861305
      },
      "baseDimensions": {
        "width": 63.609552357091715,
        "height": 152.18734021883625
      }
    },
    "59": {
      "dimensions": {
        "width": 42.5756030042668,
        "height": 59.72248969365644
      },
      "physical": {
        "mass": 54.06845113188847,
        "inertia": 41049.75421771091
      },
      "baseDimensions": {
        "width": 78.20509594805526,
        "height": 109.70139486412134
      }
    },
    "60": {
      "dimensions": {
        "width": 36.69037647546811,
        "height": 71.974991400152
      },
      "physical": {
        "mass": 62.63133070853635,
        "inertia": 63937.62908428597
      },
      "baseDimensions": {
        "width": 68.66826393422244,
        "height": 134.70555990161643
      }
    },
    "61": {
      "dimensions": {
        "width": 64.13467461362754,
        "height": 72.16912835643363
      },
      "physical": {
        "mass": 140.5620663296602,
        "inertia": 182731.2635502648
      },
      "baseDimensions": {
        "width": 120.06111915194478,
        "height": 135.10174286988072
      }
    },
    "62": {
      "dimensions": {
        "width": 36.833529548724,
        "height": 71.16515897715732
      },
      "physical": {
        "mass": 59.67742230221656,
        "inertia": 59312.49068477339
      },
      "baseDimensions": {
        "width": 68.86527197395084,
        "height": 133.05290283268994
      }
    },
    "63": {
      "dimensions": {
        "width": 26.738387754077564,
        "height": 46.56481132682896
      },
      "physical": {
        "mass": 16.837077729311165,
        "inertia": 6694.970046053338
      },
      "baseDimensions": {
        "width": 47.574023437499996,
        "height": 82.85
      }
    },
    "64": {
      "dimensions": {
        "width": 58.649902378203656,
        "height": 69.99708628820576
      },
      "physical": {
        "mass": 116.43231311883956,
        "inertia": 136555.9075504894
      },
      "baseDimensions": {
        "width": 109.48647308781473,
        "height": 130.6691706782311
      }
    },
    "65": {
      "dimensions": {
        "width": 64.75771334043421,
        "height": 72.71041497873316
      },
      "physical": {
        "mass": 144.5132550530038,
        "inertia": 191221.75553570702
      },
      "baseDimensions": {
        "width": 121.3087964087562,
        "height": 136.20636789755082
      }
    },
    "66": {
      "dimensions": {
        "width": 56.69310752996876,
        "height": 71.14429180231375
      },
      "physical": {
        "mass": 113.89756159159776,
        "inertia": 134507.95128612206
      },
      "baseDimensions": {
        "width": 105.99259744576871,
        "height": 133.0103183633176
      }
    },
    "446": {
      "dimensions": {
        "width": 16.74718983368009,
        "height": 16.74718983368009
      },
      "physical": {
        "mass": 0.7245046328098689,
        "inertia": 31.790104080284546
      },
      "baseDimensions": {
        "width": 22,
        "height": 22
      }
    },
    "447": {
      "dimensions": {
        "width": 32.42777960822017,
        "height": 32.42777960822017
      },
      "physical": {
        "mass": 10.714068134933623,
        "inertia": 2415.0238132773566
      },
      "baseDimensions": {
        "width": 54,
        "height": 54
      }
    },
    "448": {
      "dimensions": {
        "width": 51.04847996548652,
        "height": 51.04847996548652
      },
      "physical": {
        "mass": 52.9830074674541,
        "inertia": 34665.04394331029
      },
      "baseDimensions": {
        "width": 92,
        "height": 92
      }
    },
    "449": {
      "dimensions": {
        "width": 38.3080007736727,
        "height": 38.3080007736727
      },
      "physical": {
        "mass": 19.56162508586646,
        "inertia": 6586.766924962851
      },
      "baseDimensions": {
        "width": 66,
        "height": 66
      }
    },
    "426": {
      "dimensions": {
        "width": 51.34366976537459,
        "height": 77.01550464806189
      },
      "physical": {
        "mass": 37.037037037037045,
        "inertia": 22683.127572016467
      },
      "baseDimensions": {
        "width": 96.66128981923805,
        "height": 144.99193472885707
      }
    },
    "427": {
      "dimensions": {
        "width": 51.43138423486148,
        "height": 77.14707635229223
      },
      "physical": {
        "mass": 37.037037037037045,
        "inertia": 22683.127572016467
      },
      "baseDimensions": {
        "width": 96.84029220779219,
        "height": 145.2604383116883
      }
    },
    "416": {
      "dimensions": {
        "width": 19.92799175067079,
        "height": 55.1852079249345
      },
      "physical": {
        "mass": 14.961676324070755,
        "inertia": 7874.445294538658
      },
      "baseDimensions": {
        "width": 36.27071659908779,
        "height": 100.44198442824312
      }
    },
    "433": {
      "dimensions": {
        "width": 70.88477155020482,
        "height": 131.9745564861995
      },
      "physical": {
        "mass": 70.77753821476108,
        "inertia": 66752.59769463535
      },
      "baseDimensions": {
        "width": 138.11716360772286,
        "height": 257.14904642601493
      }
    },
    "434": {
      "dimensions": {
        "width": 79.92725236445692,
        "height": 60.101547188117024
      },
      "physical": {
        "mass": 27.495108603924066,
        "inertia": 11245.446796707409
      },
      "baseDimensions": {
        "width": 146.9173394173394,
        "height": 110.47495249155405
      }
    },
    "435": {
      "dimensions": {
        "width": 80.31851434308636,
        "height": 60.39575785564112
      },
      "physical": {
        "mass": 27.52363656817116,
        "inertia": 11265.117194692379
      },
      "baseDimensions": {
        "width": 147.7158032185206,
        "height": 111.07535984205163
      }
    },
    "436": {
      "dimensions": {
        "width": 3.005966996173469,
        "height": 4.513358070500927
      },
      "physical": {
        "mass": 0.5,
        "inertia": 5.482446040012885
      },
      "baseDimensions": {
        "width": 3.005966996173469,
        "height": 4.513358070500927
      }
    },
    "437": {
      "dimensions": {
        "width": 7.26408386515307,
        "height": 10.417957812208325
      },
      "physical": {
        "mass": 0.5,
        "inertia": 5.628359023481144
      },
      "baseDimensions": {
        "width": 7.26408386515307,
        "height": 10.417957812208325
      }
    },
    "438": {
      "dimensions": {
        "width": 37.34570237874462,
        "height": 85.74439290545848
      },
      "physical": {
        "mass": 19.310724653139804,
        "inertia": 7949.646332715121
      },
      "baseDimensions": {
        "width": 70.90934939553938,
        "height": 162.80532237899624
      }
    },
    "439": {
      "dimensions": {
        "width": 54.48774366200652,
        "height": 87.18038985921044
      },
      "physical": {
        "mass": 19.245103550275562,
        "inertia": 7915.81341751255
      },
      "baseDimensions": {
        "width": 103.58488636363637,
        "height": 165.7358181818182
      }
    },
    "440": {
      "dimensions": {
        "width": 137.45472909571208,
        "height": 155.700932073019
      },
      "physical": {
        "mass": 115.33786494468859,
        "inertia": 126750.7654181062
      },
      "baseDimensions": {
        "width": 269.759603025696,
        "height": 305.56839988751403
      }
    },
    "441": {
      "dimensions": {
        "width": 48.667372100216404,
        "height": 116.98448129253897
      },
      "physical": {
        "mass": 20.22602432801544,
        "inertia": 11551.409806428273
      },
      "baseDimensions": {
        "width": 94.2517540229913,
        "height": 226.55820685338756
      }
    },
    "442": {
      "dimensions": {
        "width": 43.28502047654643,
        "height": 46.953242550830026
      },
      "physical": {
        "mass": 0.7329895443766558,
        "inertia": 34.04775372966122
      },
      "baseDimensions": {
        "width": 77.10810204881327,
        "height": 83.64268696820422
      }
    },
    "443": {
      "dimensions": {
        "width": 43.28502047654643,
        "height": 46.953242550830026
      },
      "physical": {
        "mass": 0.7329895443766558,
        "inertia": 34.04775372966122
      },
      "baseDimensions": {
        "width": 77.10810204881327,
        "height": 83.64268696820422
      }
    },
    "444": {
      "dimensions": {
        "width": 43.45368627803244,
        "height": 47.0365483601535
      },
      "physical": {
        "mass": 0.7338321950708813,
        "inertia": 34.08689530205775
      },
      "baseDimensions": {
        "width": 77.42852249836673,
        "height": 83.8126924295217
      }
    },
    "445": {
      "dimensions": {
        "width": 89.58232043922256,
        "height": 134.5048330348444
      },
      "physical": {
        "mass": 70.77753821476108,
        "inertia": 66752.59769463535
      },
      "baseDimensions": {
        "width": 174.70434477866826,
        "height": 262.31268189641685
      }
    },
    "9001": {
      "dimensions": {
        "width": 3.5,
        "height": 3.5
      },
      "physical": {
        "mass": 0.5,
        "inertia": 0.3540250000000001
      },
      "baseDimensions": {
        "width": 3.5,
        "height": 3.5
      }
    }
  }
};
  const freeze=value=>{if(value&&typeof value==="object"){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
  window.nativeShipScaleSettings=freeze(settings);
})();
