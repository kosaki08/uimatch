# Area Gap Handling in v0.2.0

## 概要

v0.2.0 から、area gap の扱いが改善されました。**追加の引数は不要**で、既存のコマンドがそのまま賢くなります。

## 変更内容

### 変更前の挙動

```bash
# Area gap が 20% で areaGapCritical (15%) を超えている
# 他の指標は全て OK でも...
npx uimatch compare figma=... story=... selector=...

# ❌ Quality gate failed
# Reason: Area gap 20.0% exceeds critical threshold 15.0%
```

### 変更後の挙動（v0.2.0）

```bash
# 同じ状況でも...
npx uimatch compare figma=... story=... selector=...

# ✅ Quality gate passed
# Reason: Area gap 20.0% > 15.0% but pixelDiff / colorDeltaE / styleCoverage
#         are within thresholds - treating area gap as warning and passing gate
```

---

## 具体的な動作条件

### Gate が通過する条件（新しいロジック）

以下の**全て**が満たされる場合、area gap が大きくても gate を通過：

1. ✅ **pixelDiffRatio** ≤ しきい値（例: 1%）
2. ✅ **colorDeltaEAvg** ≤ しきい値（例: 3.0）
3. ✅ **styleCoverage** ≥ しきい値（設定されている場合）
4. ⚠️ **area gap だけ**が問題

### Gate が失敗する条件

以下の**いずれか**が満たされる場合、area gap が大きいと gate が失敗：

1. ❌ pixelDiffRatio がしきい値を超えている
2. ❌ colorDeltaEAvg がしきい値を超えている
3. ❌ styleCoverage がしきい値未満（設定されている場合）
4. ❌ high_severity な style diff がある

---

## 実際の使用例

### ケース1: Figma と実装でサイズが違うが、見た目は完璧

```bash
npx uimatch compare \
  figma=fileKey:nodeId \
  story=http://localhost:6006/?path=/story/button \
  selector="#root button" \
  profile=component/strict

# Figma: 200x50px
# 実装: 240x60px (20% area gap)
# でも、pixelDiff=0.5%, colorDeltaE=1.2

# ✅ Pass! (area gap は warning として記録される)
```

### ケース2: サイズも違うし、色も違う

```bash
npx uimatch compare \
  figma=fileKey:nodeId \
  story=http://localhost:6006/?path=/story/button \
  selector="#root button" \
  profile=component/strict

# Figma: 200x50px
# 実装: 240x60px (20% area gap)
# pixelDiff=5%, colorDeltaE=8.0

# ❌ Fail! (area gap + 他の指標も NG)
```

---

## 既存のプロファイルでの動作

既存のプロファイルは**そのまま使えます**：

```bash
# component/strict プロファイル
npx uimatch compare ... profile=component/strict
# areaGapCritical: 15%
# → 15% 超えても、他が OK なら通過

# component/dev プロファイル
npx uimatch compare ... profile=component/dev
# areaGapCritical: 20%
# → 20% 超えても、他が OK なら通過

# lenient プロファイル
npx uimatch compare ... profile=lenient
# areaGapCritical: 30%
# → 30% 超えても、他が OK なら通過
```

---

## カスタム設定（オプション）

もし area gap の挙動をカスタマイズしたい場合：

```bash
# areaGapCritical を緩くする
npx uimatch compare ... \
  pixelDiffRatio=0.01 \
  deltaE=3.0 \
  areaGapCritical=0.25  # 25% まで許容

# areaGapWarning も調整可能
npx uimatch compare ... \
  areaGapCritical=0.20 \
  areaGapWarning=0.10   # 10% で warning 表示
```

---

## まとめ

**追加の引数は不要**で、既存のコマンドがそのまま賢くなります：

- ✅ **自動的に改善**: area gap だけの問題なら通過
- ✅ **後方互換性**: 既存のプロファイルやコマンドはそのまま動作
- ✅ **透明性**: `reasons` に「area gap を warning として扱った」と記録される
- ✅ **柔軟性**: 必要に応じて `areaGapCritical` をカスタマイズ可能

---

## 技術的な詳細

### 内部ロジック

1. Quality Gate 評価時に `gatingViolations` を導入
2. `suspicion` と `re_evaluation` は情報提供のみ（gate を落とさない）
3. `area_gap` だけが violation で、他の指標が全て OK の場合：
   - `gatingViolations` から `area_gap` を除外
   - `reasons` に warning メッセージを追加
   - `pass = true` を返す

### report.json の変化

```json
{
  "qualityGate": {
    "pass": true,
    "hardGateViolations": [
      {
        "type": "area_gap",
        "reason": "Area gap 20.0% exceeds critical threshold 15.0%",
        "severity": "critical"
      }
    ],
    "reasons": [
      "Area gap 20.0% > 15.0% but pixelDiff / colorDeltaE / styleCoverage are within thresholds - treating area gap as warning and passing gate"
    ]
  }
}
```

- `hardGateViolations` には `area_gap` が残る（ログ・デバッグ用）
- `pass` は `true`
- `reasons` に warning メッセージが含まれる
