# T Social - Monorepo Architecture
Get the app now 

https://upload.app/download/xclone/com.xclone.app/479807cbc0307049ce09a726bf4368c34bd3785f15bdab22bb3132f51b5ef109

## 🏗️ Current Structure

This project is organized as a **hybrid monorepo** with clear separation of concerns:

```
t-social/
├── src/                    # Frontend Application (React + TypeScript)
│   ├── components/         # Reusable UI Components
│   │   ├── ui/            # Base shadcn/ui components
│   │   ├── features/      # Feature-specific components
│   │   └── layout/        # Layout components
│   ├── pages/             # Page-level components (routes)
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Shared utilities
│   ├── stores/            # State management (Zustand)
│   └── types/             # TypeScript type definitions
│
├── supabase/              # Backend Infrastructure
│   └── functions/         # Serverless Edge Functions
│       ├── _shared/       # Shared backend utilities
│       └── ai-news-bot/   # AI news posting automation
│
├── android/               # Mobile App (Capacitor)
│   └── app/              # Android native configuration
│
├── public/               # Static Assets
│   ├── robots.txt        # SEO crawler configuration
│   └── sitemap.xml       # SEO sitemap
│
└── docs/                 # Documentation
    ├── COMPREHENSIVE_UPDATE.md
    ├── WORLD_CLASS_FEATURES.md
    └── MONOREPO_STRUCTURE.md (this file)
```

## 📦 Package Organization

### Frontend Package (`src/`)
- **Technology**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand + React Query
- **Routing**: React Router v6
- **Responsibilities**:
  - User interface and interactions
  - Client-side routing
  - State management
  - API consumption

### Backend Package (`supabase/`)
- **Technology**: PostgreSQL + Edge Functions (Deno)
- **Features**:
  - User authentication
  - Database operations
  - Real-time subscriptions
  - File storage
  - Serverless functions
- **Responsibilities**:
  - Data persistence
  - Business logic
  - Authorization
  - External API integrations

### Mobile Package (`android/`)
- **Technology**: Capacitor (web-to-native bridge)
- **Platform**: Android (iOS support via Capacitor)
- **Responsibilities**:
  - Native mobile wrapper
  - Platform-specific features
  - App store deployment

## 🔗 Inter-Package Communication

### Frontend → Backend
```typescript
// Via Supabase client
import { supabase } from '@/lib/supabase';

// Database queries
const { data } = await supabase.from('posts').select('*');

// Edge function calls
const { data } = await supabase.functions.invoke('ai-news-bot');

// Real-time subscriptions
supabase.channel('posts').on('INSERT', callback).subscribe();
```

### Backend → Frontend
```typescript
// Via database triggers and webhooks
// Example: Auto-update trending when new post created
CREATE TRIGGER on_post_created
  AFTER INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_trending();
```

## 🎯 Monorepo Benefits

### Code Sharing
- **Shared types** between frontend and backend
- **Utility functions** reused across packages
- **Constants** defined once, used everywhere

### Atomic Changes
- Single PR can update frontend, backend, and mobile
- Version control tracks all changes together
- Easier to maintain consistency

### Developer Experience
- Single repository to clone and manage
- Shared tooling (TypeScript, linters, formatters)
- Unified deployment pipeline

## 🚀 Deployment Strategy

### Frontend Deployment
- **Platform**: OnSpace Hosting (or Vercel/Netlify)
- **Build**: `npm run build` → Static files
- **URL**: `https://[project].onspace.app`

### Backend Deployment
- **Platform**: Supabase Cloud
- **Database**: PostgreSQL with automatic backups
- **Functions**: Auto-deployed via Supabase CLI
- **URL**: `https://[project].supabase.co`

### Mobile Deployment
- **Android**: Google Play Store (via Capacitor build)
- **iOS**: App Store (future - requires Apple Developer account)

## 🔄 Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Start frontend dev server
npm run dev

# Start Supabase locally (optional)
npx supabase start

# Build for production
npm run build

# Preview production build
npm run preview
```

### Testing Strategy
```bash
# Unit tests (frontend)
npm run test

# E2E tests (future)
npm run test:e2e

# Type checking
npm run type-check

# Linting
npm run lint
```

## 📊 Monorepo vs Polyrepo

### Why Monorepo for T Social?

✅ **Pros**:
- Frontend and backend are tightly coupled
- Shared TypeScript types prevent API mismatches
- Single source of truth for all code
- Easier refactoring across packages
- Simplified CI/CD pipeline

❌ **Polyrepo would mean**:
- Duplicate type definitions
- Complex versioning between repos
- Multiple PRs for single features
- Harder to keep packages in sync

## 🛠️ Future Enhancements

### Potential Additional Packages
```
packages/
├── @t-social/web/          # Current src/ moved here
├── @t-social/mobile/       # React Native (separate from Capacitor)
├── @t-social/shared/       # Shared utilities and types
├── @t-social/api/          # Backend API (if moving from Supabase)
├── @t-social/design-system/ # Component library
└── @t-social/cli/          # Developer CLI tools
```

### Monorepo Tools (Future)
- **Turborepo**: Fast build system for monorepos
- **Nx**: Advanced build orchestration
- **pnpm workspaces**: Efficient package management
- **Changesets**: Version management and changelogs

## 📝 Best Practices

### File Organization
- Group by feature, not by type
- Co-locate related files
- Use index files for clean imports

### Naming Conventions
- Components: PascalCase (`UserProfile.tsx`)
- Hooks: camelCase with `use` prefix (`useAuth.ts`)
- Utilities: camelCase (`formatDate.ts`)
- Types: PascalCase (`User.ts`)

### Import Paths
```typescript
// ✅ Good: Absolute imports with alias
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

// ❌ Bad: Relative imports
import { Button } from '../../components/ui/button';
```

## 🔐 Environment Variables

### Frontend (`.env`)
```bash
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

### Backend (Supabase Secrets)
```bash
# Set via Supabase dashboard or CLI
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_...
```

## 📈 Scaling Strategy

### Current: Single Monorepo
- **Team size**: 1-5 developers
- **Deployment**: Single domain + mobile app
- **Complexity**: Low to medium

### Future: Micro-frontends (if needed)
- **Team size**: 10+ developers
- **Deployment**: Multiple domains/subdomains
- **Complexity**: High

## 🎓 Learning Resources

- [Monorepo Best Practices](https://monorepo.tools/)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Nx Monorepo Guide](https://nx.dev/getting-started/intro)
- [pnpm Workspaces](https://pnpm.io/workspaces)

---

**Summary**: T Social uses a hybrid monorepo structure that balances simplicity with organization. The frontend, backend, and mobile packages are tightly integrated while maintaining clear boundaries. This architecture supports rapid development while keeping the codebase maintainable and scalable.
