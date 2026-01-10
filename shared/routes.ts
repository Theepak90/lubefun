import { z } from "zod";
import { insertUserSchema, users, bets, diceBetSchema, coinflipBetSchema, minesBetSchema, minesNextSchema, minesCashoutSchema, plinkoBetSchema, rouletteBetSchema, blackjackDealSchema, blackjackActionSchema, liveRouletteBetSchema, rouletteBets, rouletteMultiBetSchema } from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  gameError: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    register: {
      method: "POST" as const,
      path: "/api/register",
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    login: {
      method: "POST" as const,
      path: "/api/login",
      input: insertUserSchema,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: "POST" as const,
      path: "/api/logout",
      responses: {
        200: z.void(),
      },
    },
    me: {
      method: "GET" as const,
      path: "/api/user",
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: z.null(),
      },
    },
  },
  user: {
    updateSeeds: {
      method: "POST" as const,
      path: "/api/user/seeds",
      input: z.object({ clientSeed: z.string() }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
      },
    },
    stats: {
      method: "GET" as const,
      path: "/api/user/stats",
      responses: {
        200: z.object({
          totalBets: z.number(),
          totalWagered: z.number(),
          totalProfit: z.number(),
          wins: z.number(),
          losses: z.number(),
        }),
      },
    },
  },
  games: {
    dice: {
      play: {
        method: "POST" as const,
        path: "/api/games/dice",
        input: diceBetSchema,
        responses: {
          200: z.custom<typeof bets.$inferSelect>(),
          400: errorSchemas.gameError,
        },
      },
    },
    coinflip: {
      play: {
        method: "POST" as const,
        path: "/api/games/coinflip",
        input: coinflipBetSchema,
        responses: {
          200: z.custom<typeof bets.$inferSelect>(),
          400: errorSchemas.gameError,
        },
      },
    },
    mines: {
      start: {
        method: "POST" as const,
        path: "/api/games/mines/start",
        input: minesBetSchema,
        responses: {
          200: z.custom<typeof bets.$inferSelect>(),
          400: errorSchemas.gameError,
        },
      },
      reveal: {
        method: "POST" as const,
        path: "/api/games/mines/reveal",
        input: minesNextSchema,
        responses: {
          200: z.custom<typeof bets.$inferSelect>(),
          400: errorSchemas.gameError,
        },
      },
      cashout: {
        method: "POST" as const,
        path: "/api/games/mines/cashout",
        input: minesCashoutSchema,
        responses: {
          200: z.custom<typeof bets.$inferSelect>(),
          400: errorSchemas.gameError,
        },
      },
    },
    plinko: {
      play: {
        method: "POST" as const,
        path: "/api/games/plinko",
        input: plinkoBetSchema,
        responses: {
          200: z.object({
            bet: z.custom<typeof bets.$inferSelect>(),
            path: z.array(z.number()),
            binIndex: z.number(),
            multiplier: z.number(),
          }),
          400: errorSchemas.gameError,
        },
      },
    },
    roulette: {
      spin: {
        method: "POST" as const,
        path: "/api/games/roulette",
        input: rouletteBetSchema,
        responses: {
          200: z.object({
            bet: z.custom<typeof bets.$inferSelect>(),
            winningNumber: z.number(),
            color: z.enum(["red", "black", "green"]),
            won: z.boolean(),
            payout: z.number(),
          }),
          400: errorSchemas.gameError,
        },
      },
      spinMulti: {
        method: "POST" as const,
        path: "/api/games/roulette/spin-multi",
        input: rouletteMultiBetSchema,
        responses: {
          200: z.object({
            winningNumber: z.number(),
            color: z.enum(["red", "black", "green"]),
            totalBet: z.number(),
            totalPayout: z.number(),
            profit: z.number(),
            results: z.array(z.object({
              betType: z.string(),
              straightNumber: z.number().optional(),
              amount: z.number(),
              won: z.boolean(),
              payout: z.number(),
            })),
          }),
          400: errorSchemas.gameError,
        },
      },
      live: {
        current: {
          method: "GET" as const,
          path: "/api/games/roulette/live/current",
          responses: {
            200: z.object({
              roundId: z.number(),
              status: z.enum(["betting", "spinning", "results"]),
              countdown: z.number(),
              bettingEndsAt: z.number(),
              winningNumber: z.number().optional(),
              winningColor: z.string().optional(),
              recentNumbers: z.array(z.object({ number: z.number(), color: z.string() })),
            }),
          },
        },
        placeBet: {
          method: "POST" as const,
          path: "/api/games/roulette/live/bet",
          input: liveRouletteBetSchema,
          responses: {
            200: z.object({
              success: z.boolean(),
              betId: z.number().optional(),
              message: z.string().optional(),
            }),
            400: errorSchemas.gameError,
          },
        },
        myBets: {
          method: "GET" as const,
          path: "/api/games/roulette/live/my-bets",
          responses: {
            200: z.array(z.custom<typeof rouletteBets.$inferSelect>()),
          },
        },
      },
    },
    blackjack: {
      deal: {
        method: "POST" as const,
        path: "/api/games/blackjack/deal",
        input: blackjackDealSchema,
        responses: {
          200: z.object({
            bet: z.custom<typeof bets.$inferSelect>(),
            playerCards: z.array(z.number()),
            dealerCards: z.array(z.number()),
            playerTotal: z.number(),
            dealerShowing: z.number(),
            status: z.string(),
            canDouble: z.boolean(),
          }),
          400: errorSchemas.gameError,
        },
      },
      hit: {
        method: "POST" as const,
        path: "/api/games/blackjack/hit",
        input: blackjackActionSchema,
        responses: {
          200: z.object({
            bet: z.custom<typeof bets.$inferSelect>(),
            playerCards: z.array(z.number()),
            dealerCards: z.array(z.number()),
            playerTotal: z.number(),
            status: z.string(),
            outcome: z.string().optional(),
            payout: z.number().optional(),
          }),
          400: errorSchemas.gameError,
        },
      },
      stand: {
        method: "POST" as const,
        path: "/api/games/blackjack/stand",
        input: blackjackActionSchema,
        responses: {
          200: z.object({
            bet: z.custom<typeof bets.$inferSelect>(),
            playerCards: z.array(z.number()),
            dealerCards: z.array(z.number()),
            playerTotal: z.number(),
            dealerTotal: z.number(),
            status: z.string(),
            outcome: z.string(),
            payout: z.number(),
          }),
          400: errorSchemas.gameError,
        },
      },
      double: {
        method: "POST" as const,
        path: "/api/games/blackjack/double",
        input: blackjackActionSchema,
        responses: {
          200: z.object({
            bet: z.custom<typeof bets.$inferSelect>(),
            playerCards: z.array(z.number()),
            dealerCards: z.array(z.number()),
            playerTotal: z.number(),
            dealerTotal: z.number(),
            status: z.string(),
            outcome: z.string(),
            payout: z.number(),
          }),
          400: errorSchemas.gameError,
        },
      },
      active: {
        method: "GET" as const,
        path: "/api/games/blackjack/active",
        responses: {
          200: z.object({
            bet: z.custom<typeof bets.$inferSelect>().nullable(),
            playerCards: z.array(z.number()),
            dealerCards: z.array(z.number()),
            playerTotal: z.number(),
            dealerShowing: z.number(),
            status: z.string(),
            canDouble: z.boolean(),
          }),
          400: errorSchemas.gameError,
        },
      },
    },
    history: {
      method: "GET" as const,
      path: "/api/bets",
      responses: {
        200: z.array(z.custom<typeof bets.$inferSelect>()),
      },
    },
  },
  rewards: {
    bonusStatus: {
      method: "GET" as const,
      path: "/api/rewards/bonus/status",
      responses: {
        200: z.object({
          canClaim: z.boolean(),
          nextClaimTime: z.string().nullable(),
          bonusAmount: z.number(),
        }),
      },
    },
    claimBonus: {
      method: "POST" as const,
      path: "/api/rewards/bonus/claim",
      responses: {
        200: z.object({
          success: z.boolean(),
          amount: z.number(),
          newBalance: z.number(),
        }),
        400: errorSchemas.gameError,
      },
    },
    wheelStatus: {
      method: "GET" as const,
      path: "/api/rewards/wheel/status",
      responses: {
        200: z.object({
          canSpin: z.boolean(),
          nextSpinTime: z.string().nullable(),
        }),
      },
    },
    spinWheel: {
      method: "POST" as const,
      path: "/api/rewards/wheel/spin",
      responses: {
        200: z.object({
          success: z.boolean(),
          prizeId: z.string(),
          prizeLabel: z.string(),
          prizeValue: z.number(),
          newBalance: z.number(),
          cooldownEndsAt: z.string(),
        }),
        400: errorSchemas.gameError,
      },
    },
    allStatus: {
      method: "GET" as const,
      path: "/api/rewards/all-status",
      responses: {
        200: z.object({
          dailyReload: z.object({
            canClaim: z.boolean(),
            nextClaimTime: z.string().nullable(),
            amount: z.number(),
            label: z.string(),
            description: z.string(),
          }),
          dailyBonus: z.object({
            canClaim: z.boolean(),
            nextClaimTime: z.string().nullable(),
            amount: z.number(),
            label: z.string(),
            description: z.string(),
            volumeProgress: z.number(),
          }),
          weeklyBonus: z.object({
            canClaim: z.boolean(),
            nextClaimTime: z.string().nullable(),
            amount: z.number(),
            label: z.string(),
            description: z.string(),
          }),
          monthlyBonus: z.object({
            canClaim: z.boolean(),
            nextClaimTime: z.string().nullable(),
            amount: z.number(),
            label: z.string(),
            description: z.string(),
          }),
          rakeback: z.object({
            canClaim: z.boolean(),
            nextClaimTime: z.string().nullable(),
            amount: z.number(),
            label: z.string(),
            description: z.string(),
            wagerVolume: z.number(),
          }),
        }),
      },
    },
    claimReward: {
      method: "POST" as const,
      path: "/api/rewards/claim/:type",
      responses: {
        200: z.object({
          success: z.boolean(),
          amount: z.number(),
          newBalance: z.number(),
        }),
        400: errorSchemas.gameError,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`:${key}`, String(value));
    });
  }
  return url;
}
