// Several games share this origin. Reset only the memory game's own keys.
function clearMaruGameStorage() {
  sessionStorage.removeItem('adgame_owner_auth');
  for (const key of [
    'adgame_titles', 'adgame_airride_seen', 'adgame_disp', 'adgame_nick_changed',
    'adgame_ad_locked', 'adgame_ad_row_hidden', 'adgame_sections_hidden', 'adgame_banner_hidden',
    'gameV_maru', 'adgame_device_id', 'adgame_nick'
  ]) {
    localStorage.removeItem(key);
  }
}
