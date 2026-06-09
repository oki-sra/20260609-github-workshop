# Webアプリケーションアーキテクチャ案

## 1. 目的
このドキュメントは、ポモドーロタイマーWebアプリの実装方針を整理したものです。
FlaskとHTML/CSS/JavaScriptを用い、以下を両立します。

- モックに沿ったUIを短期間で実現する
- 将来の機能拡張に耐える構造にする
- ユニットテストしやすい設計にする

## 2. 設計方針
- 初期はフロント主体で高速にMVPを作る
- Flaskは画面配信とAPIの土台に徹する
- 業務ロジックと副作用を分離し、テスト容易性を高める
- 永続化は段階的に、ブラウザ保存からサーバー保存へ移行可能にする

## 3. 全体アーキテクチャ
### 3.1 レイヤ構成
1. プレゼンテーション層
   - FlaskテンプレートでHTMLを返す
   - CSSでモック準拠のスタイルを表現
   - JavaScriptで画面更新とユーザー操作を処理

2. フロントアプリ層
   - タイマー状態管理
   - 状態遷移の制御
   - 進捗リングや文言の描画制御

3. バックエンド層
   - Flaskのルーティング
   - 設定・統計のAPI提供
   - 入出力バリデーション

4. データ層
   - 初期: localStorage
   - 拡張: SQLiteとSQLAlchemy

### 3.2 責務分離の原則
- UI更新、通知音、ストレージ書き込みは副作用として分離
- タイマー計算と状態遷移は純粋なロジックとして分離
- Flaskのルートは薄く保ち、ロジックはサービス層に寄せる

## 4. フロントエンド設計
### 4.1 タイマー状態モデル
代表的な状態:
- idle: 待機
- focus: 作業中
- short_break: 短休憩
- long_break: 長休憩
- paused: 一時停止
- completed: 1セッション完了

代表的なイベント:
- START
- PAUSE
- RESUME
- RESET
- TICK
- COMPLETE

### 4.2 時間計算の方針
- 間隔実行の回数に依存しない
- 終了予定時刻と現在時刻の差で残り時間を算出
- タブ非アクティブ復帰時のズレを最小化

### 4.3 UI構成
- 中央に残り時間表示
- 外周に進捗リング表示
- 下部に今日の進捗カードを配置
- 主操作として開始、リセット、必要に応じて一時停止と再開

## 5. バックエンド設計
### 5.1 Flaskエンドポイント案
- GET /
  - 画面の返却
- GET /api/stats/today
  - 当日の完了数と集中時間を返却
- POST /api/sessions
  - セッション開始、完了、中断の記録
- GET /api/settings
  - 設定取得
- PUT /api/settings
  - 設定更新

### 5.2 サービス層
- TimerService
  - 状態遷移ルールと時間計算
- StatsService
  - 日次集計
- SettingsService
  - 設定の検証と保存

### 5.3 リポジトリ層
- SessionRepository
- SummaryRepository
- SettingsRepository

実装差し替え:
- 開発初期: メモリまたはlocalStorage連携
- 拡張時: SQLite実装

## 6. データモデル案
### 6.1 Session
- id
- mode
- planned_seconds
- actual_seconds
- started_at
- ended_at
- status (completed, interrupted)

### 6.2 DailySummary
- date
- completed_pomodoros
- total_focus_seconds

### 6.3 Settings
- focus_minutes
- short_break_minutes
- long_break_minutes
- long_break_interval

## 7. テストしやすさを高める改善点
### 7.1 重要改善
1. タイマーエンジンを純粋関数で設計
   - 入力: 現在状態、イベント、現在時刻
   - 出力: 次状態
   - これによりユニットテストで副作用を排除できる

2. Clock抽象を導入
   - 実運用はシステム時刻
   - テストは固定時刻または疑似時刻
   - 待機なしで時間進行を検証できる

3. ステートマシンを明示化
   - 遷移表により許可イベントを固定
   - 無効遷移をテストで検知しやすい

4. 永続化をインターフェース化
   - リポジトリ契約に対してテストする
   - 実装ごとの差を契約テストで保証する

5. Flaskルートを薄くする
   - ルートはHTTP入出力に限定
   - 業務ロジックはサービス層でテスト

### 7.2 推奨テスト分類
1. ドメイン単体テスト
   - 状態遷移
   - 時間計算
   - 境界条件

2. サービステスト
   - セッション記録
   - 日次集計
   - 設定検証

3. APIテスト
   - 正常系
   - 不正入力とエラーレスポンス

4. 契約テスト
   - リポジトリ実装の差し替え互換性

## 8. ディレクトリ構成案
以下は実装を進める際の推奨構成です。

- 1.pomodoro/
  - app.py
  - domain/
    - timer_state.py
    - timer_engine.py
  - services/
    - timer_service.py
    - stats_service.py
    - settings_service.py
  - repositories/
    - interfaces.py
    - sqlite_repositories.py
  - templates/
    - index.html
  - static/
    - css/
      - style.css
    - js/
      - timer_store.js
      - timer_ui.js
      - api_client.js
  - tests/
    - test_timer_engine.py
    - test_timer_service.py
    - test_stats_service.py
    - test_api.py

## 9. 実装フェーズ
1. フェーズ1: MVP
- 単画面UI
- タイマー状態機械
- localStorage保存

2. フェーズ2: サーバー連携
- Flask API追加
- 日次統計のサーバー保存

3. フェーズ3: 機能拡張
- 長休憩
- 通知
- 履歴画面

4. フェーズ4: 品質強化
- テスト拡充
- 回帰防止の自動化

## 10. 非機能要件メモ
- 可観測性: 主要イベントをログ化
- 保守性: レイヤ境界を越えた依存を禁止
- 拡張性: 設定値と永続化方式を差し替え可能に維持
- ユーザー体験: モバイルとデスクトップ双方で崩れないUI
