# 業務改善管理（bpims）

ヒアリング・タスク・改善プロジェクト・システム化を管理する社内向けアプリです。

## 構成

- フロント: `artifacts/bpims`（React + Vite）
- API: `artifacts/api-server`（Express）
- DB: PostgreSQL（ローカル）または Supabase Postgres
- 認証: Supabase Auth（メール＋パスワード）

## ローカル起動

1. `.env.example` を `.env` にコピーして値を入れる
2. `pnpm install`
3. `pnpm dev:api` と `pnpm dev`（別ターミナル）

## 本番（Vercel + Supabase）

- DB / Auth: Supabase プロジェクト `gyoumuhearing`
- ホスティング: Vercel（このリポジトリを連携）
- 必要な環境変数は `.env.example` を参照

### 最初のログインユーザー

Supabase Dashboard → Authentication → Users → Add user でメールとパスワードを作成してください（公開サインアップは使いません）。
