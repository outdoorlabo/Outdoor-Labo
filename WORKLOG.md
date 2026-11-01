# WORKLOG — 作業記録

> 判断の理由と作業の経過をここに残す。決定事項そのものは SPEC.md が正本。

## 2026-11-01

- 本プロジェクトの実装を Muse（むぎ）に一元化。オーナーはクライアント役に専念し、確認・承認は本番反映の塊単位に圧縮する運用で合意。
- baseURL を `https://outdoorlabo.pages.dev/` から `https://outdoorlabo.a-ce.com/` に切替（main へ直接コミット 2ea31bf）。切替後の実測：sitemap.xml の 1,322 URL が全て本番ドメイン、canonical も本番ドメインに一致。理由：移行の動機の一つが Search Console のインデックス問題であり、sitemap/canonical が pages.dev を指す状態はそれに真っ向から反する。
- PR #10 プレビューの Decap ログイン不可を解消。原因はプレビュー用 OAuth Worker の許可オリジンに PR #10 のプレビュー URL が未登録だったこと（Referer 付きで /auth を実測し 403 "This CMS origin is not allowed." を確認）。ダッシュボードで CMS_ORIGIN / CMS_ORIGINS を `https://test-decap-category-hierarch.outdoorlabo.pages.dev` に更新し、/auth の 302 を実測、オーナーのログイン成功を確認。教訓：Worker の変数変更はシークレット再提示の制約（エラー 10021）により API から行えないため、ダッシュボード＋ wrangler.toml の一致確認が確実な手順。
- カテゴリー管理・タグ管理が "No entries" だった問題を解消。Decap の GitHub バックエンドは nested の depth がパス区切り数と一致しないとエントリを除外する仕様で、`_index.md` 形式（2区切り）に対し depth: 1 だったのが原因。対象2コレクションの depth を 2 に変更（コミット d503787）。
- レポ全体の棚卸しを実施（INVENTORY 相当）。本番は Pages から配信中、記事298件・カテゴリー94件・タグ922件を確認。タグに表記ゆれペアが存在（掃除は任意作業として保留）。
- 旧記事のアフィリエイト全件調査を実施。Rinker/カエレバの完成 HTML が 172件に残存し、そのまま表示可能。本人の ID（Amazon tag=labocon-22、もしも a_id 2種、VC sid）を確認。新規挿入機能は SPEC §S5 の方針で実装する。
- Decap の WordPress 同等化ギャップ棚卸しを実施。設定のみで可能な項目（locale: ja、固定ページ、preview_path、タグ relation 化、toc フィールド）とカスタム実装項目（プレビュー見た目、エディタ部品）に分類済み。メニューの Decap 編集化は誤操作リスクから非推奨と判断。
