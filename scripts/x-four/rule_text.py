"""Rule explanations shared by the image renderer and accessible ALT text."""
def sudoku_rules(kind):
    if kind=='jigsaw':return ['たて・よこ・色で分けた9マスの枠に1〜9を1回ずつ。']
    common='たて・よこ・3×3の太い枠に1〜9を1回ずつ。'
    extra={
      'normal':None,
      'diagonal':'色のついた2本の対角線にも1〜9を1回ずつ入れます。',
      'hyper':'色のついた4つの3×3の領域にも1〜9を1回ずつ入れます。',
      'antiknight':'縦2・横1マス（または縦1・横2）離れたマスに同じ数字は入りません。'}
    if kind not in extra:raise ValueError('Unknown Sudoku rule')
    return [common]+([extra[kind]] if extra[kind] else [])
