from showcase_phone import adb, capture, tap


def tool(name):
    tap('All tools')
    adb('shell', 'input', 'swipe', '540', '750', '540', '1780', '350')
    adb('shell', 'input', 'swipe', '540', '750', '540', '1780', '350')
    tap(name, scroll=True)
    print('Opened', name, flush=True)


tool('Characters')
try:
    tap('Mara Venn')
except RuntimeError:
    pass
capture('character')
tool('Mechanics & AI')
tap('Combat Settings combatSettings', scroll=True)
tap('FORM VIEW', scroll=True)
adb('shell', 'input', 'swipe', '540', '1770', '540', '1120', '350')
capture('combat')
tool('Music')
tap('CharacterCreationFantasy Character creation', scroll=True)
tap('Variant 1', scroll=True)
adb('shell', 'input', 'swipe', '540', '1770', '540', '1120', '350')
capture('track')
tool('Artwork')
tap('Map artwork')
capture('map-art')
tool('Publish')
tap('Open full-screen preview', scroll=True)
capture('preview')
tap('Close publication preview')
tool('World')
try:
    tap('Open editor')
except RuntimeError:
    pass
tap('Builder notes · 0', scroll=True)
capture('notes')
tool('Planning')
tap('Objective', scroll=True)
capture('work-order')
