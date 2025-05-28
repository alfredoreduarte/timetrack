# Git Workflow for TimeTrack Monorepo

## Repository Structure
This is a monorepo containing:
- `packages/api/` - Express.js API server
- `packages/ui/` - React frontend application
- `packages/shared/` - Shared types and utilities

## Basic Git Commands

### Daily Development
```bash
# Check status
git status

# Add changes
git add .                    # Add all changes
git add packages/api/        # Add only API changes
git add packages/ui/         # Add only UI changes

# Commit changes
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug in timer"
git commit -m "docs: update API documentation"

# View history
git log --oneline
git log --graph --oneline --all
```

### Branching Strategy
```bash
# Create and switch to new feature branch
git checkout -b feature/timer-improvements
git checkout -b fix/api-authentication
git checkout -b docs/setup-instructions

# Switch between branches
git checkout main
git checkout feature/timer-improvements

# Merge feature branch back to main
git checkout main
git merge feature/timer-improvements

# Delete merged branch
git branch -d feature/timer-improvements
```

### Useful Commands
```bash
# See what changed
git diff                     # Unstaged changes
git diff --staged           # Staged changes
git diff HEAD~1             # Changes since last commit

# Undo changes
git checkout -- filename    # Discard unstaged changes to file
git reset HEAD filename     # Unstage file
git reset --soft HEAD~1     # Undo last commit, keep changes staged
git reset --hard HEAD~1     # Undo last commit, discard changes

# View file history
git log --follow filename
```

## Commit Message Conventions

Use conventional commit format:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:
```
feat(api): add user authentication endpoints
fix(ui): resolve timer display issue
docs(readme): update installation instructions
refactor(shared): extract common types
test(api): add unit tests for time entries
chore: update dependencies
```

## Monorepo-Specific Tips

### Working with Packages
```bash
# Make changes to specific package
cd packages/api/
# ... make changes ...
cd ../../
git add packages/api/
git commit -m "feat(api): add new endpoint"

# Make changes across packages
git add packages/api/ packages/shared/
git commit -m "feat: add shared types for new feature"
```

### Package-Specific Branches
```bash
# Create branches for package-specific work
git checkout -b api/add-authentication
git checkout -b ui/improve-dashboard
git checkout -b shared/add-types
```

## Preparing for Remote Repository

When ready to connect to GitHub:
```bash
# Add remote origin
git remote add origin https://github.com/yourusername/timetrack-monorepo.git

# Push to GitHub
git push -u origin main

# Future pushes
git push
```

## Best Practices

1. **Commit Often**: Make small, focused commits
2. **Clear Messages**: Use descriptive commit messages
3. **Test Before Commit**: Ensure code works before committing
4. **Review Changes**: Use `git diff` before committing
5. **Keep Main Clean**: Use feature branches for development
6. **Package Scope**: Indicate which package(s) your changes affect

## Current Status
- ✅ Repository initialized
- ✅ Initial commit completed
- ✅ .gitignore configured
- ✅ All packages committed
- 🔄 Ready for feature development
- ⏳ Remote repository (when needed)