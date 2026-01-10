# replit.md

## Overview

A provably fair casino-style gaming platform built with play money. Features multiple games (Dice, Coinflip, Mines), a rewards system with daily bonuses and wheel spins, and cryptographic fairness verification. Users receive play credits to wager on games with transparent, verifiable outcomes.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state and caching
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Animations**: Framer Motion for game animations (dice rolls, coin flips, tile reveals)
- **UI Components**: Radix UI primitives wrapped with shadcn/ui styling

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **Session Management**: express-session with connect-pg-simple for PostgreSQL session storage
- **Authentication**: Passport.js with Local Strategy (username/password)

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit with `drizzle-kit push` for schema synchronization
- **Tables**: 
  - `users` - Player accounts with balance, seeds, nonces, and bonus timestamps
  - `bets` - Game history with provably fair verification data

### Provably Fair System
- **Server Seed**: Generated per user using crypto.randomBytes, hidden until revealed
- **Client Seed**: User-controllable seed for verification
- **Nonce**: Incrementing counter ensuring unique outcomes per bet
- **Hash Function**: HMAC-SHA256 combining server seed, client seed, and nonce
- **Games**: Dice (0-100 roll), Coinflip (heads/tails), Mines (grid positions)

### API Structure
- Routes defined in `shared/routes.ts` with Zod schemas for validation
- RESTful endpoints under `/api/` prefix
- Authentication: `/api/register`, `/api/login`, `/api/logout`, `/api/user`
- Games: `/api/games/dice`, `/api/games/coinflip`, `/api/games/mines/*`
- Rewards: `/api/rewards/bonus/*`, `/api/rewards/wheel/*`, and other bonus endpoints

### Build System
- Development: `tsx` for TypeScript execution
- Production: esbuild for server bundling, Vite for client bundling
- Output: `dist/` directory with `index.cjs` (server) and `public/` (client assets)

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management
- **connect-pg-simple**: Session storage in PostgreSQL

### UI Libraries
- **shadcn/ui**: Pre-built accessible components built on Radix UI
- **Radix UI**: Unstyled accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Framer Motion**: Animation library for game interactions
- **Lucide React**: Icon library

### Form & Validation
- **React Hook Form**: Form state management
- **Zod**: Schema validation for API inputs and form data
- **drizzle-zod**: Automatic Zod schema generation from Drizzle tables

### Development Tools
- **Vite**: Frontend build tool with HMR
- **esbuild**: Fast server bundling for production
- **TypeScript**: Type safety across the entire codebase

### Replit-Specific
- **@replit/vite-plugin-runtime-error-modal**: Error overlay in development
- **@replit/vite-plugin-cartographer**: Development tooling (dev only)
- **@replit/vite-plugin-dev-banner**: Development banner (dev only)