# ポモドーロタイマー 動作マニュアル

このドキュメントは、ポモドーロタイマーアプリをローカルで実行するための手順です。
対象ディレクトリは 1.pomodoro です。

## 1. 前提
- OS: Linux / macOS 想定
- Python 3.14 付近で確認済み
- リポジトリのルートで作業する

## 2. 初回セットアップ
1. リポジトリのルートに移動
   cd /workspaces/20260609-github-workshop

2. 仮想環境を作成（未作成の場合のみ）
   python3 -m venv .venv

3. 仮想環境を有効化
   source .venv/bin/activate

4. 依存関係をインストール
   pip install -r 1.pomodoro/requirements-dev.txt

## 3. アプリ起動
1. アプリディレクトリへ移動
   cd 1.pomodoro

2. Flaskアプリを起動
   python app.py

3. ブラウザで以下を開く
   http://127.0.0.1:5000/

4. 画面に ポモドーロタイマー の見出しとモック画像が表示されれば起動成功

## 4. テスト実行
1. リポジトリルートに戻る
   cd /workspaces/20260609-github-workshop

2. テストを実行
   .venv/bin/python -m pytest -q 1.pomodoro

3. 期待結果
   1 passed と表示される

## 5. Lint / Format チェック
1. Ruff
   .venv/bin/python -m ruff check 1.pomodoro

2. Black（チェックのみ）
   .venv/bin/python -m black --check 1.pomodoro

3. Black（整形を適用する場合）
   .venv/bin/python -m black 1.pomodoro

## 6. よくあるトラブル
1. No module named pytest と表示される
- 原因: 仮想環境に依存が入っていない
- 対応: source .venv/bin/activate 後に pip install -r 1.pomodoro/requirements-dev.txt を再実行

2. 5000番ポートが使用中
- 対応: 使用中プロセスを停止するか、別ポートで起動する
- 例:
  FLASK_APP=app.py flask run --port 5001

3. 画像が表示されない
- 対応: 1.pomodoro/static/images/pomodoro.png の存在を確認

## 7. 停止方法
- 起動中ターミナルで Ctrl + C
