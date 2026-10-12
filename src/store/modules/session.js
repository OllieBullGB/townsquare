/**
 * Handle a vote request.
 * If the vote is from a seat that is already locked, ignore it.
 * @param state session state
 * @param index seat of the player in the circle
 * @param vote true or false
 */
const handleVote = (state, [index, vote]) => {
  if (!state.nomination) return;
  state.votes = [...state.votes];
  state.votes[index] = vote === undefined ? !state.votes[index] : vote;
};

const state = () => ({
  sessionId: "",
  isSpectator: false,
  isReconnecting: false,
  playerCount: 0,
  ping: 0,
  playerId: "",
  claimedSeat: -1,
  nomination: false,
  votes: [],
  lockedVote: 0,
  votingSpeed: 3000,
  isVoteInProgress: false,
  voteHistory: [],
  markedPlayer: -1,
  isVoteHistoryAllowed: true,
  isRolesDistributed: false,
  chatMessages: [],
  chatTabs: [],
  chatOpen: null,
  chatFlight: null
});

const getters = {};

const actions = {};

// mutations helper functions
const set = key => (state, val) => {
  state[key] = val;
};

const getChatKey = (fromIndex, toIndex) => {
  const [first, second] = [fromIndex, toIndex].sort((a, b) => a - b);
  return `${first}-${second}`;
};

const mutations = {
  setPlayerId: set("playerId"),
  setSpectator: set("isSpectator"),
  setReconnecting: set("isReconnecting"),
  setPlayerCount: set("playerCount"),
  setPing: set("ping"),
  setVotingSpeed: set("votingSpeed"),
  setVoteInProgress: set("isVoteInProgress"),
  setMarkedPlayer: set("markedPlayer"),
  setNomination: set("nomination"),
  setVoteHistoryAllowed: set("isVoteHistoryAllowed"),
  claimSeat: set("claimedSeat"),
  distributeRoles: set("isRolesDistributed"),
  setSessionId(state, sessionId) {
    state.sessionId = sessionId
      .toLocaleLowerCase()
      .replace(/[^0-9a-z]/g, "")
      .substr(0, 10);
  },
  nomination(
    state,
    { nomination, votes, votingSpeed, lockedVote, isVoteInProgress } = {}
  ) {
    state.nomination = nomination || false;
    state.votes = votes || [];
    state.votingSpeed = votingSpeed || state.votingSpeed;
    state.lockedVote = lockedVote || 0;
    state.isVoteInProgress = isVoteInProgress || false;
  },
  /**
   * Create an entry in the vote history log. Requires current player array because it might change later in the game.
   * Only stores votes that were completed.
   * @param state
   * @param players
   */
  addHistory(state, players) {
    if (!state.isVoteHistoryAllowed && state.isSpectator) return;
    if (!state.nomination || state.lockedVote <= players.length) return;
    const isExile = players[state.nomination[1]].role.team === "traveler";
    state.voteHistory.push({
      timestamp: new Date(),
      nominator: players[state.nomination[0]].name,
      nominee: players[state.nomination[1]].name,
      type: isExile ? "Exile" : "Execution",
      majority: Math.ceil(
        players.filter(player => !player.isDead || isExile).length / 2
      ),
      votes: players
        .filter((player, index) => state.votes[index])
        .map(({ name }) => name)
    });
  },
  clearVoteHistory(state) {
    state.voteHistory = [];
  },
  openChat(state, { fromIndex, toIndex } = {}) {
    if (fromIndex === undefined || toIndex === undefined) {
      state.chatOpen = null;
      return;
    }
    const key = getChatKey(fromIndex, toIndex);
    let tab = state.chatTabs.find(chat => chat.key === key);
    if (!tab) {
      tab = { key, fromIndex, toIndex, unread: 0 };
      state.chatTabs.push(tab);
    } else {
      tab.fromIndex = fromIndex;
      tab.toIndex = toIndex;
    }
    tab.unread = 0;
    state.chatOpen = { fromIndex, toIndex };
  },
  closeChat(state) {
    state.chatOpen = null;
  },
  clearChatFlight(state) {
    state.chatFlight = null;
  },
  addChatMessage(state, payload = {}) {
    if (!payload || !payload.message) return;
    const message = {
      id: payload.id || `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
      from: payload.from || "",
      to: payload.to || "",
      fromName: payload.fromName || "Player",
      toName: payload.toName || "Player",
      fromIndex: payload.fromIndex,
      toIndex: payload.toIndex,
      message: payload.message,
      timestamp: payload.timestamp || new Date().toISOString()
    };
    state.chatMessages.push(message);
    state.chatMessages = state.chatMessages.slice(-200);
    if (message.fromIndex !== undefined && message.toIndex !== undefined) {
      const key = getChatKey(message.fromIndex, message.toIndex);
      let tab = state.chatTabs.find(chat => chat.key === key);
      if (!tab) {
        tab = { key, fromIndex: message.fromIndex, toIndex: message.toIndex, unread: 0 };
        state.chatTabs.push(tab);
      }
      const isCurrentChat =
        state.chatOpen &&
        state.chatOpen.fromIndex === message.fromIndex &&
        state.chatOpen.toIndex === message.toIndex;
      if (payload.isFromSocket && !isCurrentChat) {
        tab.unread = (tab.unread || 0) + 1;
        state.chatOpen = { fromIndex: message.fromIndex, toIndex: message.toIndex };
      } else if (!payload.isFromSocket || isCurrentChat) {
        tab.unread = 0;
      }
      state.chatFlight = {
        fromIndex: message.fromIndex,
        toIndex: message.toIndex,
        id: message.id
      };
    }
  },
  /**
   * Store a vote with and without syncing it to the live session.
   * This is necessary in order to prevent infinite voting loops.
   * @param state
   * @param vote
   */
  vote: handleVote,
  voteSync: handleVote,
  lockVote(state, lock) {
    state.lockedVote = lock !== undefined ? lock : state.lockedVote + 1;
  }
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
};
