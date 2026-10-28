---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
slug: ""
category: []        # 例: ["ランニング"]  ※親カテゴリも入れるとWPと同じ挙動
tag: []
image: ""           # アイキャッチ。例: /images/2026/05/xxx.jpg
description: ""     # 空なら本文冒頭から自動生成
draft: true
---
