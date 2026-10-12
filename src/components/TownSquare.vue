<template>
  <div
    id="townsquare"
    class="square"
    :class="{
      public: grimoire.isPublic,
      spectator: session.isSpectator,
      vote: session.nomination
    }"
  >
    <ul class="circle" :class="['size-' + players.length]">
      <Player
        v-for="(player, index) in players"
        :key="index"
        :player="player"
        @trigger="handleTrigger(index, $event)"
        :class="{
          from: Math.max(swap, move, nominate) === index,
          swap: swap > -1,
          move: move > -1,
          nominate: nominate > -1
        }"
      ></Player>
    </ul>

    <div
      v-if="session.chatFlight"
      class="postcard-flight"
      :style="chatFlightStyle"
      aria-hidden="true"
    >
      <font-awesome-icon icon="envelope" />
    </div>

    <div
      v-if="canOpenNeighborChat"
      class="neighbor-chat-widget"
    >
      <button class="neighbor-chat-toggle" @click="toggleNeighborChatMenu">
        <font-awesome-icon icon="envelope" />
        <span>Chat</span>
      </button>
      <div v-if="isNeighborChatMenuOpen" class="neighbor-chat-menu">
        <div class="neighbor-chat-menu-header">Neighbors</div>
        <button
          v-for="neighborIndex in adjacentPlayerIndexes"
          :key="neighborIndex"
          class="neighbor-chat-option"
          @click="openDirectChat(neighborIndex)"
        >
          {{ players[neighborIndex].name }}
        </button>
      </div>
    </div>

    <div
      v-if="session.chatOpen && session.isSpectator"
      class="private-chat"
      :style="privateChatStyle"
    >
      <div class="private-chat-header" @mousedown="startChatDrag">
        <div class="private-chat-tabs">
          <button
            v-for="tab in session.chatTabs"
            :key="tab.key"
            class="private-chat-tab"
            :class="{
              active: isChatTabActive(tab),
              unread: tab.unread > 0
            }"
            @click.stop="selectChatTab(tab)"
          >
            <span>{{ chatTabLabel(tab) }}</span>
            <em v-if="tab.unread">{{ tab.unread }}</em>
          </button>
        </div>
        <font-awesome-icon
          icon="times-circle"
          class="close-chat"
          @click.stop="closeChat"
        />
      </div>
      <ul class="private-chat-thread">
        <li
          v-for="message in activeChatMessages"
          :key="message.id"
          :class="{ me: message.from === session.playerId }"
        >
          <strong>{{ message.from === session.playerId ? "You" : message.fromName }}</strong>
          <span>{{ message.message }}</span>
        </li>
      </ul>
      <div class="private-chat-actions">
        <input
          v-model="chatDraft"
          type="text"
          maxlength="200"
          placeholder="Send a message..."
          @keyup.enter="sendChatMessage"
        />
        <button @click="sendChatMessage">Send</button>
      </div>
    </div>

    <div
      v-if="!session.isSpectator && hostChatMessages.length"
      class="host-chat-log"
      :style="hostChatLogStyle"
    >
      <div class="private-chat-header" @mousedown="startHostChatDrag">
        <span>Host chat log</span>
        <font-awesome-icon icon="times-circle" class="close-chat" @click.stop="closeHostChatLog" />
      </div>
      <ul class="private-chat-thread">
        <li v-for="message in hostChatMessages" :key="message.id">
          <strong>{{ message.fromName }} → {{ message.toName }}</strong>
          <span>{{ message.message }}</span>
        </li>
      </ul>
      <div class="chat-resizer" @mousedown="startHostChatResize"></div>
    </div>

    <div
      class="bluffs"
      v-if="players.length"
      ref="bluffs"
      :class="{ closed: !isBluffsOpen }"
    >
      <h3>
        <span v-if="session.isSpectator">Other characters</span>
        <span v-else>Demon bluffs</span>
        <font-awesome-icon icon="times-circle" @click.stop="toggleBluffs" />
        <font-awesome-icon icon="plus-circle" @click.stop="toggleBluffs" />
      </h3>
      <ul>
        <li
          v-for="index in bluffSize"
          :key="index"
          @click="openRoleModal(index * -1)"
        >
          <Token :role="bluffs[index - 1]"></Token>
        </li>
      </ul>
    </div>

    <div class="fabled" :class="{ closed: !isFabledOpen }" v-if="fabled.length">
      <h3>
        <span>Fabled</span>
        <font-awesome-icon icon="times-circle" @click.stop="toggleFabled" />
        <font-awesome-icon icon="plus-circle" @click.stop="toggleFabled" />
      </h3>
      <ul>
        <li
          v-for="(role, index) in fabled"
          :key="index"
          @click="removeFabled(index)"
        >
          <div
            class="night-order first"
            v-if="nightOrder.get(role).first && grimoire.isNightOrder"
          >
            <em>{{ nightOrder.get(role).first }}.</em>
            <span v-if="role.firstNightReminder">{{
              role.firstNightReminder
            }}</span>
          </div>
          <div
            class="night-order other"
            v-if="nightOrder.get(role).other && grimoire.isNightOrder"
          >
            <em>{{ nightOrder.get(role).other }}.</em>
            <span v-if="role.otherNightReminder">{{
              role.otherNightReminder
            }}</span>
          </div>
          <Token :role="role"></Token>
        </li>
      </ul>
    </div>

    <ReminderModal :player-index="selectedPlayer"></ReminderModal>
    <RoleModal :player-index="selectedPlayer"></RoleModal>
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import Player from "./Player";
import Token from "./Token";
import ReminderModal from "./modals/ReminderModal";
import RoleModal from "./modals/RoleModal";

export default {
  components: {
    Player,
    Token,
    RoleModal,
    ReminderModal
  },
  computed: {
    ...mapGetters({ nightOrder: "players/nightOrder" }),
    ...mapState(["grimoire", "roles", "session"]),
    ...mapState("players", ["players", "bluffs", "fabled"]),
    currentChatTarget() {
      if (!this.session.chatOpen) return null;
      return this.players[this.session.chatOpen.toIndex] || null;
    },
    canOpenNeighborChat() {
      return (
        this.session.sessionId &&
        this.session.isSpectator &&
        this.adjacentPlayerIndexes.length
      );
    },
    adjacentPlayerIndexes() {
      if (
        !this.session.sessionId ||
        !this.session.isSpectator ||
        !this.session.playerId ||
        !this.players.length
      ) {
        return [];
      }
      const playerIndex = this.players.findIndex(
        player => player.id === this.session.playerId
      );
      if (playerIndex < 0) return [];
      const neighbors = [playerIndex - 1, playerIndex + 1].map(
        index => (index + this.players.length) % this.players.length
      );
      return neighbors.filter(
        index =>
          index !== playerIndex &&
          this.players[index] &&
          this.players[index].id &&
          this.players[index].id !== this.session.playerId
      );
    },
    privateChatStyle() {
      return {
        left: `${this.chatPanelPosition.x}px`,
        top: `${this.chatPanelPosition.y}px`,
        width: `${this.chatPanelSize.width}px`,
        height: `${this.chatPanelSize.height}px`,
        right: "auto",
        bottom: "auto"
      };
    },
    hostChatLogStyle() {
      return {
        left: `${this.hostChatLogPosition.x}px`,
        top: `${this.hostChatLogPosition.y}px`,
        width: `${this.hostChatLogSize.width}px`,
        height: `${this.hostChatLogSize.height}px`,
        right: "auto",
        bottom: "auto"
      };
    },
    isChatMenuOpen() {
      return !!this.session.chatOpen || this.isNeighborChatMenuOpen;
    },
    activeChatMessages() {
      if (!this.session.chatOpen) return [];
      const { fromIndex, toIndex } = this.session.chatOpen;
      return this.session.chatMessages.filter(({ fromIndex: src, toIndex: dst }) => {
        return (
          (src === fromIndex && dst === toIndex) ||
          (src === toIndex && dst === fromIndex)
        );
      });
    },
    hostChatMessages() {
      return this.session.chatMessages.slice(-12);
    },
    chatFlightStyle() {
      if (!this.session.chatFlight || !this.$el) return {};
      const { fromIndex, toIndex } = this.session.chatFlight;
      const seats = this.$el.querySelectorAll(".player");
      const source = seats[fromIndex];
      const target = seats[toIndex];
      if (!source || !target) return {};
      const container = this.$el.getBoundingClientRect();
      const fromRect = source.getBoundingClientRect();
      const toRect = target.getBoundingClientRect();
      const fromX = fromRect.left - container.left + fromRect.width / 2;
      const fromY = fromRect.top - container.top + fromRect.height / 2;
      const toX = toRect.left - container.left + toRect.width / 2;
      const toY = toRect.top - container.top + toRect.height / 2;
      return {
        left: `${fromX}px`,
        top: `${fromY}px`,
        "--dx": `${toX - fromX}px`,
        "--dy": `${toY - fromY}px`
      };
    }
  },
  data() {
    return {
      selectedPlayer: 0,
      bluffSize: 3,
      swap: -1,
      move: -1,
      nominate: -1,
      isBluffsOpen: true,
      isFabledOpen: true,
      chatDraft: "",
      isNeighborChatMenuOpen: false,
      chatPanelPosition: { x: 20, y: 20 },
      chatPanelSize: { width: 360, height: 320 },
      chatDragOffset: null,
      hostChatLogPosition: { x: 20, y: 20 },
      hostChatLogSize: { width: 360, height: 260 },
      hostChatDragOffset: null,
      hostChatResizeOffset: null
    };
  },
  methods: {
    toggleBluffs() {
      this.isBluffsOpen = !this.isBluffsOpen;
    },
    toggleFabled() {
      this.isFabledOpen = !this.isFabledOpen;
    },
    removeFabled(index) {
      if (this.session.isSpectator) return;
      this.$store.commit("players/setFabled", { index });
    },
    handleTrigger(playerIndex, [method, params]) {
      if (typeof this[method] === "function") {
        this[method](playerIndex, params);
      }
    },
    claimSeat(playerIndex) {
      if (!this.session.isSpectator) return;
      if (this.session.playerId === this.players[playerIndex].id) {
        this.$store.commit("session/claimSeat", -1);
      } else {
        this.$store.commit("session/claimSeat", playerIndex);
      }
    },
    openReminderModal(playerIndex) {
      this.selectedPlayer = playerIndex;
      this.$store.commit("toggleModal", "reminder");
    },
    openRoleModal(playerIndex) {
      const player = this.players[playerIndex];
      if (this.session.isSpectator && player && player.role.team === "traveler")
        return;
      this.selectedPlayer = playerIndex;
      this.$store.commit("toggleModal", "role");
    },
    removePlayer(playerIndex) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (
        confirm(
          `Do you really want to remove ${this.players[playerIndex].name}?`
        )
      ) {
        const { nomination } = this.session;
        if (nomination) {
          if (nomination.includes(playerIndex)) {
            // abort vote if removed player is either nominator or nominee
            this.$store.commit("session/nomination");
          } else if (
            nomination[0] > playerIndex ||
            nomination[1] > playerIndex
          ) {
            // update nomination array if removed player has lower index
            this.$store.commit("session/setNomination", [
              nomination[0] > playerIndex ? nomination[0] - 1 : nomination[0],
              nomination[1] > playerIndex ? nomination[1] - 1 : nomination[1]
            ]);
          }
        }
        this.$store.commit("players/remove", playerIndex);
      }
    },
    swapPlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        this.swap = from;
      } else {
        if (this.session.nomination) {
          // update nomination if one of the involved players is swapped
          const swapTo = this.players.indexOf(to);
          const updatedNomination = this.session.nomination.map(nom => {
            if (nom === this.swap) return swapTo;
            if (nom === swapTo) return this.swap;
            return nom;
          });
          if (
            this.session.nomination[0] !== updatedNomination[0] ||
            this.session.nomination[1] !== updatedNomination[1]
          ) {
            this.$store.commit("session/setNomination", updatedNomination);
          }
        }
        this.$store.commit("players/swap", [
          this.swap,
          this.players.indexOf(to)
        ]);
        this.cancel();
      }
    },
    movePlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        this.move = from;
      } else {
        if (this.session.nomination) {
          // update nomination if it is affected by the move
          const moveTo = this.players.indexOf(to);
          const updatedNomination = this.session.nomination.map(nom => {
            if (nom === this.move) return moveTo;
            if (nom > this.move && nom <= moveTo) return nom - 1;
            if (nom < this.move && nom >= moveTo) return nom + 1;
            return nom;
          });
          if (
            this.session.nomination[0] !== updatedNomination[0] ||
            this.session.nomination[1] !== updatedNomination[1]
          ) {
            this.$store.commit("session/setNomination", updatedNomination);
          }
        }
        this.$store.commit("players/move", [
          this.move,
          this.players.indexOf(to)
        ]);
        this.cancel();
      }
    },
    nominatePlayer(from, to) {
      if (this.session.isSpectator || this.session.lockedVote) return;
      if (to === undefined) {
        this.cancel();
        if (from !== this.nominate) {
          this.nominate = from;
        }
      } else {
        const nomination = [this.nominate, this.players.indexOf(to)];
        this.$store.commit("session/nomination", { nomination });
        this.cancel();
      }
    },
    cancel() {
      this.move = -1;
      this.swap = -1;
      this.nominate = -1;
    },
    toggleNeighborChatMenu() {
      if (!this.session.isSpectator) return;
      this.isNeighborChatMenuOpen = !this.isNeighborChatMenuOpen;
    },
    isChatTabActive(tab) {
      return (
        this.session.chatOpen &&
        this.session.chatOpen.fromIndex === tab.fromIndex &&
        this.session.chatOpen.toIndex === tab.toIndex
      );
    },
    chatTabLabel(tab) {
      const firstIndex = tab.fromIndex;
      const secondIndex = tab.toIndex;
      const participant =
        this.players[firstIndex] && this.players[firstIndex].id === this.session.playerId
          ? this.players[secondIndex]
          : this.players[firstIndex];
      return participant ? participant.name : "Chat";
    },
    selectChatTab(tab) {
      if (!tab) return;
      this.$store.commit("session/openChat", {
        fromIndex: tab.fromIndex,
        toIndex: tab.toIndex
      });
    },
    openDirectChat(neighborIndex) {
      if (
        !this.session.isSpectator ||
        !this.players[neighborIndex] ||
        this.players[neighborIndex].id === this.session.playerId
      ) {
        return;
      }
      this.isNeighborChatMenuOpen = false;
      this.$store.commit("session/openChat", {
        fromIndex: this.players.findIndex(player => player.id === this.session.playerId),
        toIndex: neighborIndex
      });
    },
    startChatDrag(event) {
      if (event.target && event.target.closest(".close-chat")) return;
      const panel = this.$el.querySelector(".private-chat");
      if (!panel) return;
      const rect = this.$el.getBoundingClientRect();
      this.chatDragOffset = {
        x: event.clientX - rect.left - this.chatPanelPosition.x,
        y: event.clientY - rect.top - this.chatPanelPosition.y
      };
      window.addEventListener("mousemove", this.dragChatPanel);
      window.addEventListener("mouseup", this.stopChatDrag);
    },
    dragChatPanel(event) {
      if (!this.chatDragOffset) return;
      const rect = this.$el.getBoundingClientRect();
      const maxX = Math.max(0, rect.width - this.chatPanelSize.width);
      const maxY = Math.max(0, rect.height - this.chatPanelSize.height);
      this.chatPanelPosition = {
        x: Math.min(Math.max(0, event.clientX - rect.left - this.chatDragOffset.x), maxX),
        y: Math.min(Math.max(0, event.clientY - rect.top - this.chatDragOffset.y), maxY)
      };
    },
    stopChatDrag() {
      this.chatDragOffset = null;
      this.hostChatDragOffset = null;
      this.hostChatResizeOffset = null;
      window.removeEventListener("mousemove", this.dragChatPanel);
      window.removeEventListener("mousemove", this.dragHostChatLog);
      window.removeEventListener("mousemove", this.resizeHostChatLog);
      window.removeEventListener("mouseup", this.stopChatDrag);
    },
    startHostChatDrag(event) {
      if (event.target && event.target.closest(".close-chat")) return;
      const rect = this.$el.getBoundingClientRect();
      this.hostChatDragOffset = {
        x: event.clientX - rect.left - this.hostChatLogPosition.x,
        y: event.clientY - rect.top - this.hostChatLogPosition.y
      };
      window.addEventListener("mousemove", this.dragHostChatLog);
      window.addEventListener("mouseup", this.stopChatDrag);
    },
    dragHostChatLog(event) {
      if (!this.hostChatDragOffset) return;
      const rect = this.$el.getBoundingClientRect();
      const maxX = Math.max(0, rect.width - this.hostChatLogSize.width);
      const maxY = Math.max(0, rect.height - this.hostChatLogSize.height);
      this.hostChatLogPosition = {
        x: Math.min(Math.max(0, event.clientX - rect.left - this.hostChatDragOffset.x), maxX),
        y: Math.min(Math.max(0, event.clientY - rect.top - this.hostChatDragOffset.y), maxY)
      };
    },
    startHostChatResize(event) {
      const rect = this.$el.getBoundingClientRect();
      this.hostChatResizeOffset = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      window.addEventListener("mousemove", this.resizeHostChatLog);
      window.addEventListener("mouseup", this.stopChatDrag);
    },
    resizeHostChatLog(event) {
      if (!this.hostChatResizeOffset) return;
      const rect = this.$el.getBoundingClientRect();
      const width = Math.max(220, Math.min(520, event.clientX - rect.left - this.hostChatLogPosition.x + 10));
      const height = Math.max(200, Math.min(520, event.clientY - rect.top - this.hostChatLogPosition.y + 8));
      this.hostChatLogSize = { width, height };
    },
    closeHostChatLog() {
      this.hostChatLogPosition = { x: 20, y: 20 };
      this.hostChatLogSize = { width: 360, height: 260 };
    },
    closeChat() {
      this.$store.commit("session/closeChat");
      this.chatDraft = "";
    },
    sendChatMessage() {
      if (!this.session.chatOpen) return;
      const { fromIndex, toIndex } = this.session.chatOpen;
      const fromPlayer = this.players[fromIndex];
      const toPlayer = this.players[toIndex];
      if (!fromPlayer || !toPlayer || !fromPlayer.id || !toPlayer.id) return;
      const message = this.chatDraft.trim();
      if (!message) return;
      this.$store.commit("session/addChatMessage", {
        from: fromPlayer.id,
        to: toPlayer.id,
        fromName: fromPlayer.name || "Player",
        toName: toPlayer.name || "Player",
        fromIndex,
        toIndex,
        message,
        timestamp: new Date().toISOString()
      });
      this.chatDraft = "";
    }
  }
};
</script>

<style lang="scss">
@use "sass:math";
@import "../vars.scss";

#townsquare {
  width: 100%;
  height: 100%;
  padding: 20px;
  display: flex;
  align-items: center;
  align-content: center;
  justify-content: center;
}

.circle {
  padding: 0;
  width: 100%;
  height: 100%;
  list-style: none;
  margin: 0;

  > li {
    position: absolute;
    left: 50%;
    height: 50%;
    transform-origin: 0 100%;
    pointer-events: none;

    &:hover {
      z-index: 25 !important;
    }

    > .player {
      margin-left: -50%;
      width: 100%;
      pointer-events: all;
    }
    > .reminder {
      margin-left: -25%;
      width: 50%;
      pointer-events: all;
    }
  }
}

@mixin on-circle($item-count) {
  $angle: math.div(360, $item-count);
  $rot: 0;

  // rotation and tooltip placement
  @for $i from 1 through $item-count {
    &:nth-child(#{$i}) {
      transform: rotate($rot * 1deg);
      @if $i - 1 <= math.div($item-count, 2) {
        // first half of players
        z-index: $item-count - $i + 1;
        // open menu on the left
        .player > .menu {
          left: auto;
          right: 110%;
          margin-right: 15px;
          &:before {
            border-left-color: black;
            border-right-color: transparent;
            right: auto;
            left: 100%;
          }
        }
        .fold-enter-active,
        .fold-leave-active {
          transform-origin: right center;
        }
        .fold-enter,
        .fold-leave-to {
          transform: perspective(200px) rotateY(-90deg);
        }
        // show ability tooltip on the left
        .ability {
          right: 120%;
          left: auto;
          &:before {
            border-right-color: transparent;
            border-left-color: black;
            right: auto;
            left: 100%;
          }
        }
        .pronouns {
          left: 110%;
          right: auto;
          &:before {
            border-left-color: transparent;
            border-right-color: black;
            left: auto;
            right: 100%;
          }
        }
      } @else {
        // second half of players
        z-index: $i - 1;
      }

      > * {
        transform: rotate($rot * -1deg);
      }

      // animation cascade
      .life,
      .token,
      .shroud,
      .night-order,
      .seat {
        animation-delay: ($i - 1) * 50ms;
        transition-delay: ($i - 1) * 50ms;
      }

      // move reminders closer to the sides of the circle
      $q: math.div($item-count, 4);
      $x: $i - 1;
      @if $x < $q or ($x >= math.div($item-count, 2) and $x < $q * 3) {
        .player {
          margin-bottom: -10% + 20% * (1 - math.div($x % $q, $q));
        }
      } @else {
        .player {
          margin-bottom: -10% + 20% * math.div($x % $q, $q);
        }
      }
    }
    $rot: $rot + $angle;
  }
}

@for $i from 1 through 20 {
  .circle.size-#{$i} > li {
    @include on-circle($item-count: $i);
  }
}

/***** Demon bluffs / Fabled *******/
#townsquare > .bluffs,
#townsquare > .fabled {
  position: absolute;
  &.bluffs {
    bottom: 10px;
  }
  &.fabled {
    top: 10px;
  }
  left: 10px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 10px;
  border: 3px solid black;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
  transform-origin: bottom left;
  transform: scale(1);
  opacity: 1;
  transition: all 200ms ease-in-out;
  z-index: 50;

  > svg {
    position: absolute;
    top: 10px;
    right: 10px;
    cursor: pointer;
    &:hover {
      color: red;
    }
  }
  h3 {
    margin: 5px 1vh 0;
    display: flex;
    align-items: center;
    align-content: center;
    justify-content: center;
    span {
      flex-grow: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    svg {
      cursor: pointer;
      flex-grow: 0;
      &.fa-times-circle {
        margin-left: 1vh;
      }
      &.fa-plus-circle {
        margin-left: 1vh;
        display: none;
      }
      &:hover path {
        fill: url(#demon);
        stroke-width: 30px;
        stroke: white;
      }
    }
  }
  ul {
    display: flex;
    align-items: center;
    justify-content: center;
    li {
      width: 14vh;
      height: 14vh;
      margin: 0 0.5%;
      display: inline-block;
      transition: all 250ms;
    }
  }
  &.closed {
    svg.fa-times-circle {
      display: none;
    }
    svg.fa-plus-circle {
      display: block;
    }
    ul li {
      width: 0;
      height: 0;
      .night-order {
        opacity: 0;
      }
      .token {
        border-width: 0;
      }
    }
  }
}

#townsquare.public > .bluffs {
  opacity: 0;
  transform: scale(0.1);
}

.fabled ul li .token:before {
  content: " ";
  opacity: 0;
  transition: opacity 250ms;
  background-image: url("../assets/icons/x.png");
  z-index: 2;
}

/**** Night reminders ****/
.night-order {
  position: absolute;
  width: 100%;
  cursor: pointer;
  opacity: 1;
  transition: opacity 200ms;
  display: flex;
  top: 0;
  align-items: center;
  pointer-events: none;

  &:after {
    content: " ";
    display: block;
    padding-top: 100%;
  }

  #townsquare.public & {
    opacity: 0;
    pointer-events: none;
  }

  &:hover ~ .token .ability {
    opacity: 0;
  }

  span {
    display: flex;
    position: absolute;
    padding: 5px 10px 5px 30px;
    width: 350px;
    z-index: 25;
    font-size: 70%;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 10px;
    border: 3px solid black;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
    text-align: left;
    align-items: center;
    opacity: 0;
    transition: opacity 200ms ease-in-out;

    &:before {
      transform: rotate(-90deg);
      transform-origin: center top;
      left: -98px;
      top: 50%;
      font-size: 100%;
      position: absolute;
      font-weight: bold;
      text-align: center;
      width: 200px;
    }

    &:after {
      content: " ";
      border: 10px solid transparent;
      width: 0;
      height: 0;
      position: absolute;
    }
  }

  &.first span {
    right: 120%;
    background: linear-gradient(
      to right,
      $townsfolk 0%,
      rgba(0, 0, 0, 0.5) 20%
    );
    &:before {
      content: "First Night";
    }
    &:after {
      border-left-color: $townsfolk;
      margin-left: 3px;
      left: 100%;
    }
  }

  &.other span {
    left: 120%;
    background: linear-gradient(to right, $demon 0%, rgba(0, 0, 0, 0.5) 20%);
    &:before {
      content: "Other Nights";
    }
    &:after {
      right: 100%;
      margin-right: 3px;
      border-right-color: $demon;
    }
  }

  em {
    font-style: normal;
    position: absolute;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid black;
    filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.5));
    font-weight: bold;
    opacity: 1;
    pointer-events: all;
    transition: opacity 200ms;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 3;
  }

  &.first em {
    left: -10%;
    background: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, $townsfolk 100%);
  }

  &.other em {
    right: -10%;
    background: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, $demon 100%);
  }

  em:hover + span {
    opacity: 1;
  }

  // adjustment for fabled
  .fabled &.first {
    span {
      right: auto;
      left: 40px;
      &:after {
        left: auto;
        right: 100%;
        margin-left: 0;
        margin-right: 3px;
        border-left-color: transparent;
        border-right-color: $townsfolk;
      }
    }
  }
}

#townsquare:not(.spectator) .fabled ul li:hover .token:before {
  opacity: 1;
}

.neighbor-chat-widget {
  position: absolute;
  left: 20px;
  top: 20px;
  z-index: 80;
}

.neighbor-chat-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.64);
  color: white;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
}

.neighbor-chat-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 200px;
  background: rgba(0, 0, 0, 0.82);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.neighbor-chat-menu-header {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.8;
}

.neighbor-chat-option {
  width: 100%;
  border: none;
  background: transparent;
  color: white;
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}

.private-chat,
.host-chat-log {
  position: absolute;
  right: 20px;
  bottom: 20px;
  width: min(26vw, 360px);
  max-height: 52vh;
  background: rgba(0, 0, 0, 0.72);
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
  z-index: 80;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.private-chat {
  bottom: 20px;
}

.host-chat-log {
  top: 20px;
  bottom: auto;
  right: 20px;
}

.chat-resizer {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.05));
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  border-left: 1px solid rgba(255, 255, 255, 0.2);
}

.private-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.7rem;
  cursor: move;
  user-select: none;
  gap: 8px;
}

.private-chat-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  padding-right: 4px;
}

.private-chat-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;

  &.active {
    background: rgba(255, 220, 92, 0.2);
    border-color: rgba(255, 220, 92, 0.7);
    color: #fff7c4;
    box-shadow: 0 0 12px rgba(255, 215, 92, 0.28);
  }

  &.unread {
    border-color: rgba(255, 215, 92, 0.85);
    box-shadow: 0 0 12px rgba(255, 215, 92, 0.45);
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  em {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.4em;
    height: 1.4em;
    padding: 0 0.35em;
    border-radius: 999px;
    background: rgba(255, 215, 92, 0.25);
    color: #fff7c4;
    font-style: normal;
    font-size: 0.7rem;
  }
}

.close-chat {
  cursor: pointer;
  flex-shrink: 0;
}

.private-chat-thread {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  overflow-y: auto;
  max-height: 32vh;

  li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    line-height: 1.3;

    strong {
      font-size: 0.72rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.8;
    }

    span {
      white-space: pre-wrap;
      word-break: break-word;
    }

    &.me {
      background: rgba(107, 143, 255, 0.18);
      margin-left: 20px;
    }
  }
}

.private-chat-actions {
  display: flex;
  gap: 8px;
  padding: 10px 12px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);

  input {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.3);
    color: white;
  }

  button {
    border: none;
    border-radius: 8px;
    padding: 8px 12px;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.7), rgba(27, 27, 39, 0.8));
    color: white;
    cursor: pointer;
  }
}

.postcard-flight {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(198, 209, 255, 0.85));
  color: #1b2432;
  box-shadow: 0 0 12px rgba(136, 160, 255, 0.75);
  z-index: 90;
  pointer-events: none;
  opacity: 0;
  transform: translate(0, 0) scale(0.7);
  animation: postcard-flight 900ms ease-in-out forwards;
}

@keyframes postcard-flight {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.7);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx), var(--dy)) scale(1.2);
  }
}
</style>
