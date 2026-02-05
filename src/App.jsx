import { useState, useEffect, useRef } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Add-player state
  const [newName, setNewName] = useState('')
  const [newPoints, setNewPoints] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const normalizeName = (s) => (s ? s.trim().replace(/\s+/g, ' ').toLowerCase() : '')

  const handleSave = async () => {
    setSaveError(null)
    setSaveSuccess(false)

    const name = newName.trim()
    if (!name) {
      setSaveError('Name is required')
      return
    }

    const pts = parseFloat(String(newPoints).replace(',', '.'))
    if (!Number.isFinite(pts)) {
      setSaveError('Invalid points')
      return
    }

    // Client-side duplicate check
    const normalizedNew = normalizeName(name)
    if (players.some((p) => normalizeName(p.name) === normalizedNew)) {
      setSaveError('Player already exists')
      return
    }

    setSaving(true)
    try {
      // Server-side duplicate check (case-insensitive via q search + normalization)
      try {
        const resSearch = await fetch(`http://localhost:3001/players?q=${encodeURIComponent(name)}`)
        if (resSearch.ok) {
          const candidates = await resSearch.json()
          if (candidates.some((p) => normalizeName(p.name) === normalizedNew)) {
            setSaveError('Player already exists')
            setSaving(false)
            return
          }
        }
      } catch (e) {
        // If search fails, continue to POST (best-effort) — the client-side check already ran
        console.warn('Search check failed, proceeding to POST', e)
      }

      const res = await fetch('http://localhost:3001/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, points_from_earlier: pts })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setNewName('')
      setNewPoints('')
      setSaveSuccess(true)
      // Refresh list to include new player
      fetchPlayers()
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveSuccess(false), 3000)
    }
  }

  const fetchPlayers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('http://localhost:3001/players?_sort=points_from_earlier&_order=desc')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setPlayers(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlayers()
    fetchTournaments()
  }, [])

  // Fetch tournaments
  const [tournaments, setTournaments] = useState([])
  const [tournamentsLoading, setTournamentsLoading] = useState(false)
  const [tournamentsError, setTournamentsError] = useState(null)

  const fetchTournaments = async () => {
    setTournamentsLoading(true)
    setTournamentsError(null)
    try {
      const res = await fetch('http://localhost:3001/tournaments?_sort=id&_order=desc')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTournaments(data)
    } catch (err) {
      setTournamentsError(err.message)
    } finally {
      setTournamentsLoading(false)
    }
  }

  // Create-tournament state and handler (datepicker)
  const [tournamentDate, setTournamentDate] = useState('')
  const [creatingTournament, setCreatingTournament] = useState(false)
  const [createTournamentError, setCreateTournamentError] = useState(null)
  const [createTournamentSuccess, setCreateTournamentSuccess] = useState(false)

  const handleCreateTournament = async () => {
    setCreateTournamentError(null)
    setCreateTournamentSuccess(false)
    if (!tournamentDate) {
      setCreateTournamentError('Date is required')
      return
    }
    setCreatingTournament(true)
    try {
      const res = await fetch('http://localhost:3001/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: tournamentDate })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const created = await res.json()
      setTournamentDate('')
      setCreateTournamentSuccess(true)
      // Refresh tournaments list and select the new one
      await fetchTournaments()
      setSelectedTournament(created)
      fetchParticipants(created.id)
    } catch (err) {
      setCreateTournamentError(err.message)
    } finally {
      setCreatingTournament(false)
      setTimeout(() => setCreateTournamentSuccess(false), 3000)
    }
  }

  // Participants state and handlers
  const [selectedTournament, setSelectedTournament] = useState(null)
  const [participants, setParticipants] = useState([])
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [participantsError, setParticipantsError] = useState(null)
  // Server-snapshot of participants (used to detect local edits)
  const [serverParticipants, setServerParticipants] = useState([])
  const [newParticipantPlayerId, setNewParticipantPlayerId] = useState('')
  const [addingParticipant, setAddingParticipant] = useState(false)
  const [addParticipantError, setAddParticipantError] = useState(null)
  const [addParticipantSuccess, setAddParticipantSuccess] = useState(false)
  // Typeahead state for selecting a player to add
  const [typeaheadQuery, setTypeaheadQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const typeaheadRef = useRef(null)
  // Batched save state (sticky save)
  const [savingTournament, setSavingTournament] = useState(false)
  const [saveTournamentError, setSaveTournamentError] = useState(null)
  const [saveTournamentSuccess, setSaveTournamentSuccess] = useState(false)
  const getTypeaheadSuggestions = () => {
    const q = String(typeaheadQuery || '').toLowerCase().trim()
    if (!q) return []
    return players
      .filter(p => !participants.some(pa => (pa.player && pa.player.id === p.id) || pa.playerId === p.id))
      .filter(p => p.name.toLowerCase().includes(q))
      .slice(0, 8)
  }
  const [updatingParticipants, setUpdatingParticipants] = useState({})
  const [updateErrors, setUpdateErrors] = useState({})
  const [updateSuccess, setUpdateSuccess] = useState({})

  const handleSelectTournament = (t) => {
    // Clear participant state and set loading before fetching to avoid transient 'dirty' state while switching tournaments
    setSelectedTournament(t)
    setNewParticipantPlayerId('')
    setParticipants([])
    setServerParticipants([])
    setParticipantsLoading(true)
    fetchParticipants(t.id)
  }

 const fetchParticipants = async (gameId) => {
    setParticipantsLoading(true)
    setParticipantsError(null)
    try {
      // Fetch the tournament which now contains participants inlined
      const res = await fetch(`http://localhost:3001/tournaments/${gameId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      // Attach player objects from the already-loaded players list for immediate display
      const parts = (data.participants || []).map((p) => ({ ...p, player: players.find(pl => pl.id === p.playerId) || null }))
      setParticipants(parts)
      // keep a snapshot of server participants for dirty-checking and keep selectedTournament in sync
      setServerParticipants(data.participants || [])
      setSelectedTournament(data)
    } catch (err) {
      setParticipantsError(err.message)
    } finally {
      setParticipantsLoading(false)
    }
  }

  const handleParticipantChange = (id, field, value) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))

  }



  // Toggle "registeredLate" immediately and persist with PATCH
  const handleToggleRegisteredLate = (pa) => {
    const newVal = !Boolean(pa.registeredLate)
    // Local optimistic update only — actual persistence happens with the sticky Save
    setParticipants((prev) => prev.map((p) => (p.id === pa.id ? { ...p, registeredLate: newVal } : p)))

  }

 const handleAddParticipant = (pidArg) => {
    setAddParticipantError(null)
    setAddParticipantSuccess(false)
    if (!selectedTournament) return setAddParticipantError('Select a tournament first')
    const pid = Number(pidArg ?? newParticipantPlayerId)
    if (!pid) return setAddParticipantError('Select a player')
    if (participants.some((p) => p.playerId === pid || (p.player && p.player.id === pid))) {
      setAddParticipantError('Player already participating')
      return
    }

    // Create an optimistic participant entry so the UI feels snappy and batch-save later
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const playerObj = players.find((p) => p.id === pid) || null
    const optimistic = {
      id: tempId,
      playerId: pid,
      player: playerObj,
      prize: null,
      place: null,
      registeredLate: false
    }
    // Add locally and update selectedTournament copy — actual server save happens when 'Save changes' is used
    setParticipants((prev) => [...prev, optimistic])

    setNewParticipantPlayerId('')
    setTypeaheadQuery('')
    setShowSuggestions(false)
    setAddParticipantSuccess(true)
    try { typeaheadRef.current?.focus() } catch (e) {}
    setTimeout(() => setAddParticipantSuccess(false), 1500)
  }

 const handleRemoveParticipant = (participantId) => {
    // Remove locally; actual server removal occurs on sticky Save
    setParticipants((prev) => prev.filter((p) => p.id !== participantId))

  }

  return (
    <>

      <h1>Rangliste</h1>

      <div className="container mt-4">
        <div className="row">
          <div className="col-md-6 mb-4">
            <h2>Tournaments</h2>

            {/* Create tournament (date picker) */}
            <div className="mb-3">
              <label className="form-label">Date</label>
              <div className="d-flex gap-2">
                <input
                  type="date"
                  className="form-control"
                  value={tournamentDate}
                  onChange={(e) => setTournamentDate(e.target.value)}
                />
                <button className="btn btn-success" onClick={handleCreateTournament} disabled={creatingTournament}>
                  {creatingTournament ? 'Creating...' : 'Add'}
                </button>
              </div>
              {createTournamentError && <div className="text-danger small mt-1">{createTournamentError}</div>}
              {createTournamentSuccess && <div className="text-success small mt-1">Tournament created ✅</div>}
            </div>

            {tournamentsError && (
              <div className="alert alert-danger" role="alert">
                Error loading tournaments: {tournamentsError}
              </div>
            )}

          
            {tournamentsLoading ? (
              <div>Loading...</div>
            ) : (
              <ul className="list-group">
                {tournaments.map((t) => {
                  return (
                    <li key={t.id} onClick={() => handleSelectTournament(t)} style={{ cursor: 'pointer' }} className={`list-group-item d-flex justify-content-between align-items-center ${selectedTournament && selectedTournament.id === t.id ? 'active' : ''}`}>
                      <div>
                        <div className="fw-bold">#{t.id} — {new Date(t.date).toLocaleDateString()}</div>
                        <div className="text-muted small"> {t.participants.length} deltagere</div>
                      </div>
                    </li>
                  )
                })}
              </ul>)}

              {selectedTournament ? (
                <div className="mt-3">
                  <h5>Participants — {new Date(selectedTournament.date).toLocaleDateString()}</h5>

                 {participantsError && <div className="text-danger small">{participantsError}</div>}

                 {participantsLoading ? (
                    <div>Loading participants...</div>
                  ) : (
                    <>
                      <ul className="list-group mb-2">
                        {participants.map((pa) => (
                          <li key={pa.id} className={`list-group-item ${String(pa.id).startsWith('temp-') ? 'text-muted' : ''}`} style={String(pa.id).startsWith('temp-') ? { opacity: 0.6 } : {}}>
                            <div className="d-flex justify-content-between align-items-center">
                              <div>
                                <div className="d-flex align-items-center">
                                  <div className="fw-semibold me-2">{pa.player ? pa.player.name : `Player ${pa.playerId}`}</div>

                                </div>
                              </div>

                              <div className="d-flex gap-2 align-items-center">
                                <div className="d-flex flex-column" style={{ width: 120 }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="form-control form-control-sm"
                                    style={{ width: '100%' }}
                                    placeholder="Prize"
                                    value={pa.prize ?? ''}
                                    onChange={(e) => handleParticipantChange(pa.id, 'prize', e.target.value)}
                                  />
                                  {(() => {
                                    const v = pa.prize === '' || pa.prize === undefined || pa.prize === null ? NaN : Number(String(pa.prize).replace(',', '.'))
                                    return Number.isFinite(v) && v >= 0 ? <div className="text-muted small mt-1">√: {Math.sqrt(v).toFixed(2)}</div> : <div className="text-muted small mt-1">0</div>
                                  })()}
                                </div>

                                <div className="d-flex flex-column" style={{ width: 80 }}>
                                  <input
                                    type="number"
                                    className="form-control form-control-sm"
                                    style={{ width: '100%' }}
                                    placeholder="Place"
                                    value={pa.place ?? ''}
                                    onChange={(e) => handleParticipantChange(pa.id, 'place', e.target.value)}
                                  />
                                  {(() => {
                                    const placeVal = pa.place === '' || pa.place === undefined || pa.place === null ? NaN : Number(pa.place)
                                    const count = participants.length
                                    const prizeEmpty = pa.prize === '' || pa.prize === undefined || pa.prize === null
                                    if (!prizeEmpty) return <div className="text-muted small mt-1">-</div>
                                    if (Number.isFinite(placeVal) && placeVal > 0) return <div className="text-muted small mt-1">{(2 * count / placeVal).toFixed(2)}</div>
                                    return <div className="text-muted small mt-1">0</div>
                                  })()}
                                </div>

                                <div className="form-check ms-2 d-flex flex-column align-items-start" style={{ marginTop: '0.35rem' }}>
                                  <div className="d-flex align-items-center">
                                    <input
                                      id={`late-${pa.id}`}
                                      type="checkbox"
                                      className="form-check-input"
                                      checked={!!pa.registeredLate}
                                      disabled={!!updatingParticipants[pa.id]}
                                      onChange={() => handleToggleRegisteredLate(pa)}
                                    />
                                    <label htmlFor={`late-${pa.id}`} className="form-check-label ms-1 small">Late</label>
                                  </div>
                                  <div className="text-muted small mt-2">{pa.registeredLate ? 5 : 10}</div>
                                </div>

                                <button
                                  className="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center"
                                  style={{ width: 34, height: 34, padding: 0, lineHeight: 0 }}
                                  onClick={() => handleRemoveParticipant(pa.id)}
                                  aria-label="Remove participant"
                                  title="Remove"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                                    <path d="M5.5 5.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5z" />
                                    <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 1 1 0-2h3.086a1 1 0 0 0 .707-.293L7.5.5h1l1.207 1.207a1 1 0 0 0 .707.293H13.5a1 1 0 0 1 1 1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118z" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            {updateErrors[pa.id] && <div className="text-danger small mt-1">{updateErrors[pa.id]}</div>}
                            {updateSuccess[pa.id] && <div className="text-success small mt-1">Saved ✅</div>}
                          </li>
                        ))}
                        {participants.length === 0 && <li className="list-group-item text-muted">No participants yet</li>}
                      </ul>

                      <div className="d-flex gap-2 align-items-start">
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            ref={typeaheadRef}
                            type="text"
                            className="form-control"
                            placeholder="Type to search players..."
                            value={typeaheadQuery}
                            onChange={(e) => { setTypeaheadQuery(e.target.value); setShowSuggestions(true); setNewParticipantPlayerId('') }}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const suggestions = getTypeaheadSuggestions()
                                const top = suggestions[0]
                                if (top) {
                                  setNewParticipantPlayerId(top.id)
                                  setTypeaheadQuery(top.name)
                                  setShowSuggestions(false)
                                  handleAddParticipant(top.id)
                                } else if (newParticipantPlayerId) {
                                  handleAddParticipant()
                                } else {
                                  setAddParticipantError('Select a player')
                                }
                              }
                            }}
                          />

                          {showSuggestions && (
                            <ul className="list-group position-absolute" style={{ zIndex: 1050, width: '100%' }}>
                              {players.filter(p => !participants.some(pa => (pa.player && pa.player.id === p.id) || pa.playerId === p.id) && p.name.toLowerCase().includes(typeaheadQuery.toLowerCase())).slice(0, 8).map(p => (
                                <li key={p.id} className="list-group-item list-group-item-action" onMouseDown={(e) => { e.preventDefault(); setNewParticipantPlayerId(p.id); setTypeaheadQuery(p.name); setShowSuggestions(false); handleAddParticipant(p.id); }}>
                                  {p.name}
                                </li>
                              ))}
                              {players.filter(p => !participants.some(pa => (pa.player && pa.player.id === p.id) || pa.playerId === p.id) && p.name.toLowerCase().includes(typeaheadQuery.toLowerCase())).length === 0 && (
                                <li className="list-group-item text-muted">No matches</li>
                              )}
                            </ul>
                          )}
                        </div>

                      </div>
                      {addParticipantError && <div className="text-danger small mt-1">{addParticipantError}</div>}
                      {addParticipantSuccess && <div className="text-success small mt-1">Participant added ✅</div>}
                    </>
                  )}
                </div>
              ) : (
                <div className="text-muted small mt-3">Select a tournament to manage participants</div>
              )}

              {/* Sticky save button for batching participant changes (always mounted, fades based on dirty state) */}
              {selectedTournament && (() => {
                const isDirty = (() => {
                  if (!selectedTournament || participantsLoading) return false
                  const serverParts = serverParticipants || []
                  const localParts = participants || []
                  if (serverParts.length !== localParts.length) return true
                  const mapById = (arr) => arr.reduce((acc, p) => ({ ...acc, [String(p.id)]: p }), {})
                  const sMap = mapById(serverParts)
                  for (const lp of localParts) {
                    const sp = sMap[String(lp.id)]
                    if (!sp) return true
                    // compare the editable fields and playerId
                    if ((sp.playerId || sp.player?.id) !== (lp.playerId || lp.player?.id)) return true
                    if (Number(sp.prize) !== Number(lp.prize)) return true
                    if ((sp.place === null ? '' : String(sp.place)) !== (lp.place === null ? '' : String(lp.place))) return true
                    if (Boolean(sp.registeredLate) !== Boolean(lp.registeredLate)) return true
                  }
                  return false
                })()
                // Render always, but hide via opacity when not dirty so we can animate the fade-out after save
                const containerStyle = {
                  position: 'fixed',
                  bottom: 12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 2000,
                  transition: 'opacity 300ms ease, transform 300ms ease',
                  opacity: isDirty ? 1 : 0,
                  pointerEvents: isDirty ? 'auto' : 'none'
                }
                return (
                  <div style={containerStyle}>
                    <button className="btn btn-lg btn-success" onClick={async () => {
                      setSaveTournamentError(null)
                      setSavingTournament(true)
                      try {
                        // Ensure participants are sent without temporary metadata; assign numeric ids for new temp entries
                        let nextId = Date.now()
                        const payload = (participants || []).map((p) => ({
                          id: (String(p.id).startsWith('temp-') ? nextId++ : p.id),
                          playerId: p.playerId || (p.player && p.player.id),
                          prize: p.prize === '' || p.prize === undefined ? null : Number(String(p.prize).replace(',', '.')),
                          place: p.place === '' || p.place === undefined ? null : (Number(p.place)),
                          registeredLate: !!p.registeredLate
                        }))
                        const res = await fetch(`http://localhost:3001/tournaments/${selectedTournament.id}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participants: payload })
                        })
                        if (!res.ok) throw new Error(`HTTP ${res.status}`)
                        const updatedTournament = await res.json()
                        const mapped = (updatedTournament.participants || []).map((p) => ({ ...p, player: players.find(pl => pl.id === p.playerId) || null }))
                        setParticipants(mapped)
                        setSelectedTournament(updatedTournament)
                        setServerParticipants(updatedTournament.participants || [])
                        setSaveTournamentSuccess(true)
                        setTimeout(() => setSaveTournamentSuccess(false), 3000)
                      } catch (err) {
                        setSaveTournamentError(err.message)
                      } finally {
                        setSavingTournament(false)
                      }
                    }} disabled={savingTournament}>
                      {savingTournament ? (<><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving...</>) : 'Save changes'}
                    </button>
                    {saveTournamentError && <div className="text-danger small mt-1">{saveTournamentError}</div>}
                    {saveTournamentSuccess && <div className="text-success small mt-1">Saved ✅</div>}
                  </div>
                )
              })()}

          </div>

          <div className="col-md-6">
            <h2>Rangliste</h2>

            {error && (
              <div className="alert alert-danger" role="alert">
                Error loading players: {error}
              </div>
            )}

            <div className="mb-3 d-flex gap-2 align-items-end">
              <div className="row g-2 w-100">
                <div className="col-sm-6">
                  <label className="form-label">Name</label>
                  <input
                    className="form-control"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Player name"
                  />
                </div>
                <div className="col-sm-4">
                  <label className="form-label">Points</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={newPoints}
                    onChange={(e) => setNewPoints(e.target.value)}
                    placeholder="Points (e.g. 123.45)"
                  />
                </div>
              </div>
              <div className="d-flex flex-column">
                <button className="btn btn-success mb-2" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button className="btn btn-primary" onClick={fetchPlayers}>
                  Refresh
                </button>
              </div>
            </div>
            {saveError && (
              <div className="alert alert-danger" role="alert">
                Error saving player: {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="alert alert-success" role="alert">
                Player saved successfully ✅
              </div>
            )}

            {loading ? (
              <div>Loading...</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-striped align-middle">
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>Rank</th>
                      <th>Name</th>
                      <th className="text-end">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p, i) => (
                      <tr key={p.id}>
                        <td>{i + 1}</td>
                        <td>{p.name}</td>
                        <td className="text-end">{Number((p.points_from_earlier ?? p.points ?? 0)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default App
