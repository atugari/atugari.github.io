"""Use readable compatibility characters only when a font lacks the original."""
from unicodedata import normalize

def readable(value,cmap):
    result=[]
    for char in str(value):
        replacement=normalize('NFKC',char)
        if ord(char) not in cmap and replacement!=char and all(ord(c) in cmap for c in replacement):result.append(replacement)
        else:result.append(char)
    return ''.join(result)
