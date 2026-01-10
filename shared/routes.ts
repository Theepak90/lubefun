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
