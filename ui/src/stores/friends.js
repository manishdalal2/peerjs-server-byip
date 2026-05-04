import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'shareByAirFriends'

export const useFriendsStore = defineStore('friends', () => {
  const friends = ref(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))

  function _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(friends.value))
  }

  function add(name, peerId, pin, alias = '') {
    friends.value = [
      ...friends.value,
      { id: crypto.randomUUID(), name: name.trim(), peerId: peerId.trim(), pin: pin.trim(), alias: alias.trim() },
    ]
    _save()
  }

  function remove(id) {
    friends.value = friends.value.filter(f => f.id !== id)
    _save()
  }

  function update(id, patch) {
    friends.value = friends.value.map(f => f.id === id ? { ...f, ...patch } : f)
    _save()
  }

  return { friends, add, remove, update }
})
