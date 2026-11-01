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
- アフィリエイト挿入機能を実装（PR #11、テストブランチへマージ）。Decap エディタ部品「商品リンク」＋ Hugo ショートコード aff（yyi-rinker-* クラスでテーマ CSS を共用）。ローカル Hugo ビルドで二重 URL エンコードのバグを発見・修正してからマージし、ブランチプレビューで実描画とリンク形式を実測。経路統一はオーナー決定：新規はもしも＋Amazon タグに統一、過去リンクは変更しない。
- 同等化バッチ第1弾をテストブランチへ反映し配信確認：locale: ja、preview_path、toc フィールド、タグ relation 化、sortable 追加、registerPreviewStyle によるプレビュー見た目（preview.css はテーマ CSS から本文系を抽出）、ブログカード／YouTube のエディタ部品。続いて固定ページ（contact/search/site-map）の files コレクション化も反映・配信確認。
- カテゴリーのパンくず表示：生成スクリプト（scripts/update_category_breadcrumbs.py）を実装・検証して投入。ただし自動更新ワークフロー（.github/workflows/ 配下）は GitHub の仕様上、接続トークンからは作成できず 403 になったため、オーナーに Web 画面での設置を依頼中。設置後に種まき（全カテゴリーへの breadcrumb 書き込み）と config 切替（summary・relation の display_fields を breadcrumb に）を行う。
- パンくず自動更新ワークフローをオーナーが Web 画面で設置（e708848）。初回実行の自動コミットで種まきを確認。config の summary と relation の display_fields を breadcrumb に切替。切替時の初回 push で base64 二重エンコード事故が発生し Decap が "Error loading the CMS configuration" を表示したが、生テキストでの再 push（df505128）で復旧。教訓は SPEC §3 ルール5に明記。
- 階層（parent）データの欠落を発見し復元。94件中 parent が入っていたのは2件のみで、原因は移行スクリプト wp2hugo.py が WP の親データを記事側の祖先展開にだけ使い、カテゴリー定義に書き出していなかったこと。復元は menus.toml（WP メニュー＝オーナーが正解と提示）と記事299件のカテゴリー列からの推定の2源突合で行い、84件に親・10件をルートとした。メニュー親と記事データが決定的に矛盾する6件（ストーブ／ハイドレーション／セール情報／読み物／用具／トレーニング）は、メニューがナビ用グルーピングだったため記事データを採用。オーナーが本番 Decap で階層表示を確認（「ばっちり」）。
- カテゴリー一覧のデフォルトソートを階層パス昇順に設定（Decap の default_sort、sortable_fields のオブジェクト形式）。
- 本番昇格を実施。release/decap-production ブランチに本番用 config（branch: main、本番 Worker）・階層復元・X 自動投稿を集約し PR #12 を作成、オーナーが 2026-11-01 11:33 JST にマージ。Cloudflare Pages の本番デプロイ成功と、live の /admin/config.yml が新内容であることを実測確認。
- X 自動投稿を実装（オーナー要望）。経緯：旧連携が死んだのは X API の有料化・v1 終了のため。新規記事の公開を GitHub Actions で検知して投稿する方式を採用。X アプリは WP 時代の既存アプリを再利用し、Callback URI の WP 旧 URL をブログトップへ更新、権限を Read and Write に変更、キーを再生成して GitHub Secrets に登録（オーナー作業）。OAuth 2.0 Client ID/Secret と Bearer Token は本方式では不使用。手動 dry run が Success（20秒）で完了し、文面生成はローカル dry run でも検証済み。
