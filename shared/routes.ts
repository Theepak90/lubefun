import { z } from "zod";
import { insertUserSchema, users, bets, diceBetSchema, coinflipBetSchema, minesBetSchema, minesNextSchema, minesCashoutSchema } from "./schema";

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
