import { useState, useEffect, useRef } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";

function App() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedPlayers, setExpandedPlayers] = useState(new Set());

  // Add-player state
  const [newName, setNewName] = useState("");
  const [newPoints, setNewPoints] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const normalizeName = (s) =>
    s ? s.trim().replace(/\s+/g, " ").toLowerCase() : "";

  // Calculate points for a participant in a tournament
  const calculateParticipantPoints = (participant, participantCount) => {
    const prize = participant.prize;
    const place = participant.place;
    const bonusPoints = participant.registeredLate ? 5 : 10;

    if (prize !== null && prize !== undefined && prize !== "") {
      const prizeNum = Number(String(prize).replace(",", "."));
      if (Number.isFinite(prizeNum) && prizeNum >= 0) {
        return Math.sqrt(prizeNum) + bonusPoints;
      }
    }

    if (place !== null && place !== undefined && place !== "") {
      const placeNum = Number(place);
      if (Number.isFinite(placeNum) && placeNum > 0) {
        return (2 * participantCount) / placeNum + bonusPoints;
      }
    }

    return bonusPoints;
  };

  // Get player's tournament participations with points
  const getPlayerTournamentPoints = (playerId) => {
    const results = [];
    for (const tournament of tournaments) {
      const participant = tournament.participants?.find(
        (p) => p.playerId === playerId,
      );
      if (participant) {
        const points = calculateParticipantPoints(
          participant,
          tournament.participants.length,
        );
        results.push({
          tournamentId: tournament.id,
          date: tournament.date,
          points: points,
        });
      }
    }
    return results;
  };

  // Calculate total points for a player
  const calculateTotalPoints = (player) => {
    const fromEarlier = player.points_from_earlier || 0;
    const tournamentPoints = getPlayerTournamentPoints(player.id);
    const tournamentTotal = tournamentPoints.reduce(
      (sum, t) => sum + t.points,
      0,
    );
    return fromEarlier + tournamentTotal;
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(false);

    const name = newName.trim();
    if (!name) {
      setSaveError("Name is required");
      return;
    }

    const pts = parseFloat(String(newPoints).replace(",", "."));
    if (!Number.isFinite(pts)) {
      setSaveError("Invalid points");
      return;
    }

    // Client-side duplicate check
    const normalizedNew = normalizeName(name);
    if (players.some((p) => normalizeName(p.name) === normalizedNew)) {
      setSaveError("Player already exists");
      return;
    }

    setSaving(true);
    try {
      // Server-side duplicate check (case-insensitive via q search + normalization)
      try {
        const resSearch = await fetch(
          `http://localhost:3001/players?q=${encodeURIComponent(name)}`,
        );
        if (resSearch.ok) {
          const candidates = await resSearch.json();
          if (candidates.some((p) => normalizeName(p.name) === normalizedNew)) {
            setSaveError("Player already exists");
            setSaving(false);
            return;
          }
        }
      } catch (e) {
        // If search fails, continue to POST (best-effort) — the client-side check already ran
        console.warn("Search check failed, proceeding to POST", e);
      }

      const res = await fetch("http://localhost:3001/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          points_from_earlier: pts,
          email: newEmail.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewName("");
      setNewPoints("");
      setNewEmail("");
      setSaveSuccess(true);
      // Refresh list to include new player
      fetchPlayers();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const fetchPlayers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        "http://localhost:3001/players?_sort=points_from_earlier&_order=desc",
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPlayers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
    fetchTournaments();
  }, []);

  // Fetch tournaments
  const [tournaments, setTournaments] = useState([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [tournamentsError, setTournamentsError] = useState(null);

  const fetchTournaments = async () => {
    setTournamentsLoading(true);
    setTournamentsError(null);
    try {
      const res = await fetch(
        "http://localhost:3001/tournaments?_sort=id&_order=desc",
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTournaments(data);
    } catch (err) {
      setTournamentsError(err.message);
    } finally {
      setTournamentsLoading(false);
    }
  };

  // Create-tournament state and handler (datepicker)
  const [tournamentDate, setTournamentDate] = useState("");
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [createTournamentError, setCreateTournamentError] = useState(null);
  const [createTournamentSuccess, setCreateTournamentSuccess] = useState(false);

  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [unmatchedPlayers, setUnmatchedPlayers] = useState([]);
  const [pendingTournament, setPendingTournament] = useState(null);
  const [pendingParticipants, setPendingParticipants] = useState([]);

  const handleCreateTournament = async () => {
    setCreateTournamentError(null);
    setCreateTournamentSuccess(false);
    if (!tournamentDate) {
      setCreateTournamentError("Date is required");
      return;
    }
    setCreatingTournament(true);
    try {
      const res = await fetch("http://localhost:3001/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: tournamentDate }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();
      setTournamentDate("");
      setCreateTournamentSuccess(true);
      // Refresh tournaments list and select the new one
      await fetchTournaments();
      setSelectedTournament(created);
      fetchParticipants(created.id);
    } catch (err) {
      setCreateTournamentError(err.message);
    } finally {
      setCreatingTournament(false);
      setTimeout(() => setCreateTournamentSuccess(false), 3000);
    }
  };

  const handleFileUpload = async (e) => {
    setUploadError(null);
    setUploadSuccess(false);

    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the file input
    e.target.value = "";

    // Extract date from filename (format: ...dd_mm_yyyy.csv)
    const filename = file.name;
    const dateMatch = filename.match(/(\d{2})_(\d{2})_(\d{4})\.csv$/i);

    if (!dateMatch) {
      setUploadError("Invalid filename format. Expected: ...dd_mm_yyyy.csv");
      return;
    }

    const [, day, month, year] = dateMatch;
    const tournamentDate = `${year}-${month}-${day}`; // ISO format

    setUploadingFile(true);

    try {
      // Read and parse CSV file
      const text = await file.text();
      const lines = text.trim().split("\n");

      if (lines.length < 2) {
        throw new Error("CSV file is empty or has no data rows");
      }

      // Parse CSV (simple parser, assumes quoted fields)
      const parseCSVLine = (line) => {
        const result = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === "," && !inQuotes) {
            result.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        result.push(current);
        return result;
      };

      // Parse header and data rows
      const headers = parseCSVLine(lines[0]).map((h) => h.trim());
      const fornavnIdx = headers.indexOf("Fornavn");
      const efternavnIdx = headers.indexOf("Efternavn");
      const emailIdx = headers.indexOf("Email");
      const tidspunktIdx = headers.indexOf("Tidspunkt");

      if (fornavnIdx === -1 || efternavnIdx === -1) {
        throw new Error('CSV must contain "Fornavn" and "Efternavn" columns');
      }

      // Extract participant data from CSV
      const csvParticipants = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const fields = parseCSVLine(lines[i]);
        const fornavn = fields[fornavnIdx]?.trim() || "";
        const efternavn = fields[efternavnIdx]?.trim() || "";
        const email = emailIdx !== -1 ? fields[emailIdx]?.trim() || "" : "";
        const tidspunkt =
          tidspunktIdx !== -1 ? fields[tidspunktIdx]?.trim() || "" : "";

        // Parse registration time to determine if late (after 12:00)
        let isLate = false;
        if (tidspunkt) {
          // Format: "dd/mm/yyyy - HH:MM"
          const timeMatch = tidspunkt.match(
            /(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}):(\d{2})/,
          );
          if (timeMatch) {
            const [, , , , hour] = timeMatch;
            const hourNum = parseInt(hour, 10);
            // Late if registered after 12:00 (noon)
            isLate = hourNum >= 12;
          }
        }

        if (fornavn && efternavn) {
          csvParticipants.push({
            name: `${fornavn} ${efternavn}`,
            email: email,
            registeredLate: isLate,
          });
        }
      }

      if (csvParticipants.length === 0) {
        throw new Error("No valid participants found in CSV");
      }

      // Match CSV participants with existing players
      const matchedParticipants = [];
      const unmatched = [];

      for (const csvParticipant of csvParticipants) {
        const normalizedCsvName = normalizeName(csvParticipant.name);
        const matchedPlayer = players.find(
          (p) => normalizeName(p.name) === normalizedCsvName,
        );

        if (matchedPlayer) {
          matchedParticipants.push({
            playerId: matchedPlayer.id,
            prize: null,
            place: null,
            registeredLate: false,
          });
        } else {
          unmatched.push({
            name: csvParticipant.name,
            email: csvParticipant.email,
            points: "",
          });
        }
      }

      // Store all participants info for later
      const allParticipantsInfo = csvParticipants.map((cp) => {
        const normalizedName = normalizeName(cp.name);
        const matchedPlayer = players.find(
          (p) => normalizeName(p.name) === normalizedName,
        );
        return {
          name: cp.name,
          email: cp.email,
          playerId: matchedPlayer?.id || null,
          prize: "",
          place: "",
          registeredLate: cp.registeredLate,
        };
      });

      // If there are unmatched players, don't show participant form yet
      if (unmatched.length > 0) {
        setUnmatchedPlayers(unmatched);
        setPendingTournament({ date: tournamentDate, allParticipantsInfo });
        setUploadError(
          `Found ${unmatched.length} player(s) not in database. Please add them below.`,
        );
        setUploadingFile(false);
        return;
      }

      // All players matched - show participant input form
      setPendingParticipants(allParticipantsInfo);
      setPendingTournament({ date: tournamentDate });
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadingFile(false);
    }
  };

  // Participants state and handlers
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState(null);
  // Server-snapshot of participants (used to detect local edits)
  const [serverParticipants, setServerParticipants] = useState([]);
  const [newParticipantPlayerId, setNewParticipantPlayerId] = useState("");
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [addParticipantError, setAddParticipantError] = useState(null);
  const [addParticipantSuccess, setAddParticipantSuccess] = useState(false);
  // Typeahead state for selecting a player to add
  const [typeaheadQuery, setTypeaheadQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const typeaheadRef = useRef(null);
  // Batched save state (sticky save)
  const [savingTournament, setSavingTournament] = useState(false);
  const [saveTournamentError, setSaveTournamentError] = useState(null);
  const [saveTournamentSuccess, setSaveTournamentSuccess] = useState(false);
  const getTypeaheadSuggestions = () => {
    const q = String(typeaheadQuery || "")
      .toLowerCase()
      .trim();
    if (!q) return [];
    return players
      .filter(
        (p) =>
          !participants.some(
            (pa) =>
              (pa.player && pa.player.id === p.id) || pa.playerId === p.id,
          ),
      )
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
  };
  const [updatingParticipants, setUpdatingParticipants] = useState({});
  const [updateErrors, setUpdateErrors] = useState({});
  const [updateSuccess, setUpdateSuccess] = useState({});

  const handleSelectTournament = (t) => {
    // Clear participant state and set loading before fetching to avoid transient 'dirty' state while switching tournaments
    setSelectedTournament(t);
    setNewParticipantPlayerId("");
    setParticipants([]);
    setServerParticipants([]);
    setParticipantsLoading(true);
    fetchParticipants(t.id);
  };

  const fetchParticipants = async (gameId) => {
    setParticipantsLoading(true);
    setParticipantsError(null);
    try {
      // Fetch the tournament which now contains participants inlined
      const res = await fetch(`http://localhost:3001/tournaments/${gameId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Attach player objects from the already-loaded players list for immediate display
      const parts = (data.participants || []).map((p) => ({
        ...p,
        player: players.find((pl) => pl.id === p.playerId) || null,
      }));
      setParticipants(parts);
      // keep a snapshot of server participants for dirty-checking and keep selectedTournament in sync
      setServerParticipants(data.participants || []);
      setSelectedTournament(data);
    } catch (err) {
      setParticipantsError(err.message);
    } finally {
      setParticipantsLoading(false);
    }
  };

  const handleParticipantChange = (id, field, value) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
  };

  // Toggle "registeredLate" immediately and persist with PATCH
  const handleToggleRegisteredLate = (pa) => {
    const newVal = !Boolean(pa.registeredLate);
    // Local optimistic update only — actual persistence happens with the sticky Save
    setParticipants((prev) =>
      prev.map((p) => (p.id === pa.id ? { ...p, registeredLate: newVal } : p)),
    );
  };

  const handleAddParticipant = (pidArg) => {
    setAddParticipantError(null);
    setAddParticipantSuccess(false);
    if (!selectedTournament)
      return setAddParticipantError("Select a tournament first");
    const pid = Number(pidArg ?? newParticipantPlayerId);
    if (!pid) return setAddParticipantError("Select a player");
    if (
      participants.some(
        (p) => p.playerId === pid || (p.player && p.player.id === pid),
      )
    ) {
      setAddParticipantError("Player already participating");
      return;
    }

    // Create an optimistic participant entry so the UI feels snappy and batch-save later
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const playerObj = players.find((p) => p.id === pid) || null;
    const optimistic = {
      id: tempId,
      playerId: pid,
      player: playerObj,
      prize: null,
      place: null,
      registeredLate: false,
    };
    // Add locally and update selectedTournament copy — actual server save happens when 'Save changes' is used
    setParticipants((prev) => [...prev, optimistic]);

    setNewParticipantPlayerId("");
    setTypeaheadQuery("");
    setShowSuggestions(false);
    setAddParticipantSuccess(true);
    try {
      typeaheadRef.current?.focus();
    } catch (e) {}
    setTimeout(() => setAddParticipantSuccess(false), 1500);
  };

  const handleRemoveParticipant = (participantId) => {
    // Remove locally; actual server removal occurs on sticky Save
    setParticipants((prev) => prev.filter((p) => p.id !== participantId));
  };

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
                <button
                  className="btn btn-success"
                  onClick={handleCreateTournament}
                  disabled={creatingTournament}
                >
                  {creatingTournament ? "Creating..." : "Add"}
                </button>
              </div>
              {createTournamentError && (
                <div className="text-danger small mt-1">
                  {createTournamentError}
                </div>
              )}
              {createTournamentSuccess && (
                <div className="text-success small mt-1">
                  Tournament created ✅
                </div>
              )}
            </div>

            {/* Upload tournament from CSV */}
            <div className="mb-3">
              <label className="form-label">Or upload CSV</label>
              <input
                type="file"
                className="form-control"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={uploadingFile}
              />
              {uploadError && (
                <div className="text-danger small mt-1">{uploadError}</div>
              )}
              {uploadSuccess && (
                <div className="text-success small mt-1">
                  Tournament uploaded ✅
                </div>
              )}
            </div>

            {/* Show unmatched players that need to be added */}
            {unmatchedPlayers.length > 0 && (
              <div className="mb-3 p-3 border rounded bg-light">
                <h6 className="mb-3">Add Missing Players</h6>
                {unmatchedPlayers.map((player, idx) => (
                  <div key={idx} className="mb-2 p-2 bg-white rounded">
                    <div className="row g-2 align-items-end">
                      <div className="col-4">
                        <label className="form-label small mb-1">Name</label>
                        <input
                          className="form-control form-control-sm"
                          value={player.name}
                          readOnly
                          disabled
                        />
                      </div>
                      <div className="col-4">
                        <label className="form-label small mb-1">Email</label>
                        <input
                          className="form-control form-control-sm"
                          value={player.email}
                          readOnly
                          disabled
                        />
                      </div>
                      <div className="col-3">
                        <label className="form-label small mb-1">
                          Points from earlier
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm"
                          value={player.points}
                          onChange={(e) => {
                            const updated = [...unmatchedPlayers];
                            updated[idx].points = e.target.value;
                            setUnmatchedPlayers(updated);
                          }}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="col-1">
                        <button
                          className="btn btn-success btn-sm w-100"
                          disabled={player.saving}
                          onClick={async () => {
                            const pts = parseFloat(
                              String(player.points).replace(",", "."),
                            );
                            if (!Number.isFinite(pts)) {
                              alert("Invalid points");
                              return;
                            }

                            const updated = [...unmatchedPlayers];
                            updated[idx].saving = true;
                            setUnmatchedPlayers(updated);

                            try {
                              const res = await fetch(
                                "http://localhost:3001/players",
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    name: player.name,
                                    points_from_earlier: pts,
                                    email: player.email || null,
                                  }),
                                },
                              );
                              if (!res.ok)
                                throw new Error(`HTTP ${res.status}`);

                              // Remove from unmatched list
                              const remaining = unmatchedPlayers.filter(
                                (_, i) => i !== idx,
                              );
                              setUnmatchedPlayers(remaining);

                              // Refresh players list
                              await fetchPlayers();

                              // If all players added, show participant input form
                              if (remaining.length === 0 && pendingTournament) {
                                // Re-match all participants with newly added players
                                const updatedParticipants =
                                  pendingTournament.allParticipantsInfo.map(
                                    (p) => {
                                      if (!p.playerId) {
                                        const normalizedName = normalizeName(
                                          p.name,
                                        );
                                        const matchedPlayer = players.find(
                                          (pl) =>
                                            normalizeName(pl.name) ===
                                            normalizedName,
                                        );
                                        return {
                                          ...p,
                                          playerId: matchedPlayer?.id || null,
                                        };
                                      }
                                      return p;
                                    },
                                  );
                                setPendingParticipants(updatedParticipants);
                                setUploadError(null);
                              }
                            } catch (err) {
                              alert("Error adding player: " + err.message);
                              updated[idx].saving = false;
                              setUnmatchedPlayers(updated);
                            }
                          }}
                        >
                          {player.saving ? "..." : "Add"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Show participant input form when all players are in database */}
            {pendingParticipants.length > 0 && (
              <div className="mb-3 p-3 border rounded bg-light">
                <h6 className="mb-3">
                  Tournament Participants -{" "}
                  {pendingTournament?.date
                    ? new Date(pendingTournament.date).toLocaleDateString()
                    : ""}
                </h6>
                <div className="mb-2 small text-muted">
                  Enter prize and place for each participant (optional):
                </div>
                {pendingParticipants.map((participant, idx) => (
                  <div key={idx} className="mb-2 p-2 bg-white rounded">
                    <div className="row g-2 align-items-center">
                      <div className="col-4">
                        <div className="fw-semibold small">
                          {participant.name}
                        </div>
                      </div>
                      <div className="col-3">
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm"
                          placeholder="Prize"
                          value={participant.prize}
                          onChange={(e) => {
                            const updated = [...pendingParticipants];
                            updated[idx].prize = e.target.value;
                            setPendingParticipants(updated);
                          }}
                        />
                      </div>
                      <div className="col-2">
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          placeholder="Place"
                          value={participant.place}
                          onChange={(e) => {
                            const updated = [...pendingParticipants];
                            updated[idx].place = e.target.value;
                            setPendingParticipants(updated);
                          }}
                        />
                      </div>
                      <div className="col-3">
                        <div className="form-check">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            id={`pending-late-${idx}`}
                            checked={participant.registeredLate}
                            onChange={(e) => {
                              const updated = [...pendingParticipants];
                              updated[idx].registeredLate = e.target.checked;
                              setPendingParticipants(updated);
                            }}
                          />
                          <label
                            className="form-check-label small"
                            htmlFor={`pending-late-${idx}`}
                          >
                            Registered Late
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="d-flex gap-2 mt-3">
                  <button
                    className="btn btn-success"
                    disabled={creatingTournament}
                    onClick={async () => {
                      setCreateTournamentError(null);
                      setCreatingTournament(true);
                      try {
                        const participants = pendingParticipants.map((p) => ({
                          playerId: p.playerId,
                          prize:
                            p.prize === ""
                              ? null
                              : parseFloat(String(p.prize).replace(",", ".")),
                          place: p.place === "" ? null : parseInt(p.place),
                          registeredLate: p.registeredLate,
                        }));

                        const res = await fetch(
                          "http://localhost:3001/tournaments",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              date: pendingTournament.date,
                              participants,
                            }),
                          },
                        );

                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const created = await res.json();

                        // Clear pending state
                        setPendingParticipants([]);
                        setPendingTournament(null);
                        setCreateTournamentSuccess(true);
                        setTimeout(
                          () => setCreateTournamentSuccess(false),
                          3000,
                        );

                        // Refresh and select
                        await fetchTournaments();
                        setSelectedTournament(created);
                        fetchParticipants(created.id);
                      } catch (err) {
                        setCreateTournamentError(err.message);
                      } finally {
                        setCreatingTournament(false);
                      }
                    }}
                  >
                    {creatingTournament
                      ? "Creating Tournament..."
                      : "Add Tournament"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setPendingParticipants([]);
                      setPendingTournament(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

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
                    <li
                      key={t.id}
                      onClick={() => handleSelectTournament(t)}
                      style={{ cursor: "pointer" }}
                      className={`list-group-item d-flex justify-content-between align-items-center ${selectedTournament && selectedTournament.id === t.id ? "active" : ""}`}
                    >
                      <div>
                        <div className="fw-bold">
                          #{t.id} — {new Date(t.date).toLocaleDateString()}
                        </div>
                        <div className="text-muted small">
                          {" "}
                          {t.participants.length} deltagere
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {selectedTournament ? (
              <div className="mt-3">
                <h5>
                  Participants —{" "}
                  {new Date(selectedTournament.date).toLocaleDateString()}
                </h5>

                {participantsError && (
                  <div className="text-danger small">{participantsError}</div>
                )}

                {participantsLoading ? (
                  <div>Loading participants...</div>
                ) : (
                  <>
                    <ul className="list-group mb-2">
                      {participants.map((pa) => (
                        <li
                          key={pa.id}
                          className={`list-group-item ${String(pa.id).startsWith("temp-") ? "text-muted" : ""}`}
                          style={
                            String(pa.id).startsWith("temp-")
                              ? { opacity: 0.6 }
                              : {}
                          }
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <div className="d-flex align-items-center">
                                <div className="fw-semibold me-2">
                                  {pa.player
                                    ? pa.player.name
                                    : `Player ${pa.playerId}`}
                                </div>
                              </div>
                            </div>

                            <div className="d-flex gap-2 align-items-center">
                              <div
                                className="d-flex flex-column"
                                style={{ width: 120 }}
                              >
                                <input
                                  type="number"
                                  step="0.01"
                                  className="form-control form-control-sm"
                                  style={{ width: "100%" }}
                                  placeholder="Prize"
                                  value={pa.prize ?? ""}
                                  onChange={(e) =>
                                    handleParticipantChange(
                                      pa.id,
                                      "prize",
                                      e.target.value,
                                    )
                                  }
                                />
                                {(() => {
                                  const v =
                                    pa.prize === "" ||
                                    pa.prize === undefined ||
                                    pa.prize === null
                                      ? NaN
                                      : Number(
                                          String(pa.prize).replace(",", "."),
                                        );
                                  return Number.isFinite(v) && v >= 0 ? (
                                    <div className="text-muted small mt-1">
                                      √: {Math.sqrt(v).toFixed(2)}
                                    </div>
                                  ) : (
                                    <div className="text-muted small mt-1">
                                      0
                                    </div>
                                  );
                                })()}
                              </div>

                              <div
                                className="d-flex flex-column"
                                style={{ width: 80 }}
                              >
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  style={{ width: "100%" }}
                                  placeholder="Place"
                                  value={pa.place ?? ""}
                                  onChange={(e) =>
                                    handleParticipantChange(
                                      pa.id,
                                      "place",
                                      e.target.value,
                                    )
                                  }
                                />
                                {(() => {
                                  const placeVal =
                                    pa.place === "" ||
                                    pa.place === undefined ||
                                    pa.place === null
                                      ? NaN
                                      : Number(pa.place);
                                  const count = participants.length;
                                  const prizeEmpty =
                                    pa.prize === "" ||
                                    pa.prize === undefined ||
                                    pa.prize === null;
                                  if (!prizeEmpty)
                                    return (
                                      <div className="text-muted small mt-1">
                                        -
                                      </div>
                                    );
                                  if (Number.isFinite(placeVal) && placeVal > 0)
                                    return (
                                      <div className="text-muted small mt-1">
                                        {((2 * count) / placeVal).toFixed(2)}
                                      </div>
                                    );
                                  return (
                                    <div className="text-muted small mt-1">
                                      0
                                    </div>
                                  );
                                })()}
                              </div>

                              <div
                                className="form-check ms-2 d-flex flex-column align-items-start"
                                style={{ marginTop: "0.35rem" }}
                              >
                                <div className="d-flex align-items-center">
                                  <input
                                    id={`late-${pa.id}`}
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={!!pa.registeredLate}
                                    disabled={!!updatingParticipants[pa.id]}
                                    onChange={() =>
                                      handleToggleRegisteredLate(pa)
                                    }
                                  />
                                  <label
                                    htmlFor={`late-${pa.id}`}
                                    className="form-check-label ms-1 small"
                                  >
                                    Late
                                  </label>
                                </div>
                                <div className="text-muted small mt-2">
                                  {pa.registeredLate ? 5 : 10}
                                </div>
                              </div>

                              <button
                                className="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center"
                                style={{
                                  width: 34,
                                  height: 34,
                                  padding: 0,
                                  lineHeight: 0,
                                }}
                                onClick={() => handleRemoveParticipant(pa.id)}
                                aria-label="Remove participant"
                                title="Remove"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  fill="currentColor"
                                  viewBox="0 0 16 16"
                                  aria-hidden="true"
                                >
                                  <path d="M5.5 5.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5z" />
                                  <path
                                    fillRule="evenodd"
                                    d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 1 1 0-2h3.086a1 1 0 0 0 .707-.293L7.5.5h1l1.207 1.207a1 1 0 0 0 .707.293H13.5a1 1 0 0 1 1 1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118z"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {updateErrors[pa.id] && (
                            <div className="text-danger small mt-1">
                              {updateErrors[pa.id]}
                            </div>
                          )}
                          {updateSuccess[pa.id] && (
                            <div className="text-success small mt-1">
                              Saved ✅
                            </div>
                          )}
                        </li>
                      ))}
                      {participants.length === 0 && (
                        <li className="list-group-item text-muted">
                          No participants yet
                        </li>
                      )}
                    </ul>

                    <div className="d-flex gap-2 align-items-start">
                      <div style={{ position: "relative", flex: 1 }}>
                        <input
                          ref={typeaheadRef}
                          type="text"
                          className="form-control"
                          placeholder="Type to search players..."
                          value={typeaheadQuery}
                          onChange={(e) => {
                            setTypeaheadQuery(e.target.value);
                            setShowSuggestions(true);
                            setNewParticipantPlayerId("");
                          }}
                          onFocus={() => setShowSuggestions(true)}
                          onBlur={() =>
                            setTimeout(() => setShowSuggestions(false), 150)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const suggestions = getTypeaheadSuggestions();
                              const top = suggestions[0];
                              if (top) {
                                setNewParticipantPlayerId(top.id);
                                setTypeaheadQuery(top.name);
                                setShowSuggestions(false);
                                handleAddParticipant(top.id);
                              } else if (newParticipantPlayerId) {
                                handleAddParticipant();
                              } else {
                                setAddParticipantError("Select a player");
                              }
                            }
                          }}
                        />

                        {showSuggestions && (
                          <ul
                            className="list-group position-absolute"
                            style={{ zIndex: 1050, width: "100%" }}
                          >
                            {players
                              .filter(
                                (p) =>
                                  !participants.some(
                                    (pa) =>
                                      (pa.player && pa.player.id === p.id) ||
                                      pa.playerId === p.id,
                                  ) &&
                                  p.name
                                    .toLowerCase()
                                    .includes(typeaheadQuery.toLowerCase()),
                              )
                              .slice(0, 8)
                              .map((p) => (
                                <li
                                  key={p.id}
                                  className="list-group-item list-group-item-action"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setNewParticipantPlayerId(p.id);
                                    setTypeaheadQuery(p.name);
                                    setShowSuggestions(false);
                                    handleAddParticipant(p.id);
                                  }}
                                >
                                  {p.name}
                                </li>
                              ))}
                            {players.filter(
                              (p) =>
                                !participants.some(
                                  (pa) =>
                                    (pa.player && pa.player.id === p.id) ||
                                    pa.playerId === p.id,
                                ) &&
                                p.name
                                  .toLowerCase()
                                  .includes(typeaheadQuery.toLowerCase()),
                            ).length === 0 && (
                              <li className="list-group-item text-muted">
                                No matches
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    </div>
                    {addParticipantError && (
                      <div className="text-danger small mt-1">
                        {addParticipantError}
                      </div>
                    )}
                    {addParticipantSuccess && (
                      <div className="text-success small mt-1">
                        Participant added ✅
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="text-muted small mt-3">
                Select a tournament to manage participants
              </div>
            )}

            {/* Sticky save button for batching participant changes (always mounted, fades based on dirty state) */}
            {selectedTournament &&
              (() => {
                const isDirty = (() => {
                  if (!selectedTournament || participantsLoading) return false;
                  const serverParts = serverParticipants || [];
                  const localParts = participants || [];
                  if (serverParts.length !== localParts.length) return true;
                  const mapById = (arr) =>
                    arr.reduce((acc, p) => ({ ...acc, [String(p.id)]: p }), {});
                  const sMap = mapById(serverParts);
                  for (const lp of localParts) {
                    const sp = sMap[String(lp.id)];
                    if (!sp) return true;
                    // compare the editable fields and playerId
                    if (
                      (sp.playerId || sp.player?.id) !==
                      (lp.playerId || lp.player?.id)
                    )
                      return true;
                    if (Number(sp.prize) !== Number(lp.prize)) return true;
                    if (
                      (sp.place === null ? "" : String(sp.place)) !==
                      (lp.place === null ? "" : String(lp.place))
                    )
                      return true;
                    if (
                      Boolean(sp.registeredLate) !== Boolean(lp.registeredLate)
                    )
                      return true;
                  }
                  return false;
                })();
                // Render always, but hide via opacity when not dirty so we can animate the fade-out after save
                const containerStyle = {
                  position: "fixed",
                  bottom: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 2000,
                  transition: "opacity 300ms ease, transform 300ms ease",
                  opacity: isDirty ? 1 : 0,
                  pointerEvents: isDirty ? "auto" : "none",
                };
                return (
                  <div style={containerStyle}>
                    <button
                      className="btn btn-lg btn-success"
                      onClick={async () => {
                        setSaveTournamentError(null);
                        setSavingTournament(true);
                        try {
                          // Ensure participants are sent without temporary metadata; assign numeric ids for new temp entries
                          let nextId = Date.now();
                          const payload = (participants || []).map((p) => ({
                            id: String(p.id).startsWith("temp-")
                              ? nextId++
                              : p.id,
                            playerId: p.playerId || (p.player && p.player.id),
                            prize:
                              p.prize === "" || p.prize === undefined
                                ? null
                                : Number(String(p.prize).replace(",", ".")),
                            place:
                              p.place === "" || p.place === undefined
                                ? null
                                : Number(p.place),
                            registeredLate: !!p.registeredLate,
                          }));
                          const res = await fetch(
                            `http://localhost:3001/tournaments/${selectedTournament.id}`,
                            {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ participants: payload }),
                            },
                          );
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          const updatedTournament = await res.json();
                          const mapped = (
                            updatedTournament.participants || []
                          ).map((p) => ({
                            ...p,
                            player:
                              players.find((pl) => pl.id === p.playerId) ||
                              null,
                          }));
                          setParticipants(mapped);
                          setSelectedTournament(updatedTournament);
                          setServerParticipants(
                            updatedTournament.participants || [],
                          );
                          setSaveTournamentSuccess(true);
                          setTimeout(
                            () => setSaveTournamentSuccess(false),
                            3000,
                          );
                        } catch (err) {
                          setSaveTournamentError(err.message);
                        } finally {
                          setSavingTournament(false);
                        }
                      }}
                      disabled={savingTournament}
                    >
                      {savingTournament ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            role="status"
                            aria-hidden="true"
                          ></span>
                          Saving...
                        </>
                      ) : (
                        "Save changes"
                      )}
                    </button>
                    {saveTournamentError && (
                      <div className="text-danger small mt-1">
                        {saveTournamentError}
                      </div>
                    )}
                    {saveTournamentSuccess && (
                      <div className="text-success small mt-1">Saved ✅</div>
                    )}
                  </div>
                );
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
                <div className="col-sm-4">
                  <label className="form-label">Name</label>
                  <input
                    className="form-control"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Player name"
                  />
                </div>
                <div className="col-sm-4">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="col-sm-3">
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
                <button
                  className="btn btn-success"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
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
                      <th>Email</th>
                      <th className="text-end">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players
                      .map((p) => ({
                        ...p,
                        totalPoints: calculateTotalPoints(p),
                      }))
                      .sort((a, b) => b.totalPoints - a.totalPoints)
                      .map((p, i) => {
                        const isExpanded = expandedPlayers.has(p.id);
                        const tournamentPoints = getPlayerTournamentPoints(
                          p.id,
                        );
                        return (
                          <>
                            <tr
                              key={p.id}
                              onClick={() => {
                                const newExpanded = new Set(expandedPlayers);
                                if (isExpanded) {
                                  newExpanded.delete(p.id);
                                } else {
                                  newExpanded.add(p.id);
                                }
                                setExpandedPlayers(newExpanded);
                              }}
                              style={{ cursor: "pointer" }}
                            >
                              <td>{i + 1}</td>
                              <td>{p.name}</td>
                              <td className="text-muted small">
                                {p.email || "-"}
                              </td>
                              <td className="text-end">
                                {p.totalPoints.toFixed(2)}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${p.id}-details`}>
                                <td colSpan="4" className="bg-light">
                                  <div className="p-2 small">
                                    <table className="table table-sm table-borderless mb-0">
                                      <tbody>
                                        <tr>
                                          <td className="ps-3">
                                            Points from earlier
                                          </td>
                                          <td className="text-end pe-3">
                                            {(
                                              p.points_from_earlier || 0
                                            ).toFixed(2)}
                                          </td>
                                        </tr>
                                        {tournamentPoints.map((tp) => (
                                          <tr key={tp.tournamentId}>
                                            <td className="ps-3">
                                              Tournament{" "}
                                              {new Date(
                                                tp.date,
                                              ).toLocaleDateString("en-GB")}
                                            </td>
                                            <td className="text-end pe-3">
                                              {tp.points.toFixed(2)}
                                            </td>
                                          </tr>
                                        ))}
                                        <tr className="fw-bold border-top">
                                          <td className="ps-3">Total</td>
                                          <td className="text-end pe-3">
                                            {p.totalPoints.toFixed(2)}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
