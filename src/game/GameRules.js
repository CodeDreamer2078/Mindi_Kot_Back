import { RANK_VALUES, TEAM_A, TEAM_B, TOTAL_TRICKS } from '../constants.js';

/**
 * Card rank value for comparisons.
 * Order: 2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A
 */
export function getCardValue(card) {
  return RANK_VALUES[card.rank];
}

/**
 * Open trump method: suit of a randomly chosen card from the dealt hands.
 * Isolated so the trump rule can be swapped later without touching play flow.
 */
export function determineTrump(room) {
  const allCards = room.players.flatMap((player) => player.hand);

  if (allCards.length === 0) {
    throw new Error('Cannot determine trump before cards are dealt');
  }

  const pick = allCards[Math.floor(Math.random() * allCards.length)];
  return pick.suit;
}

/**
 * Follow-suit + ownership validation.
 * Players must follow the lead suit if they hold any card of that suit.
 */
export function isValidMove(player, card, currentTrick, trumpSuit) {
  if (!player || !card) {
    return { valid: false, message: 'Invalid player or card' };
  }

  if (!player.hasCard(card.id)) {
    return { valid: false, message: 'You do not have that card' };
  }

  if (currentTrick.length === 0) {
    return { valid: true };
  }

  const leadSuit = currentTrick[0].card.suit;
  const hasLeadSuit = player.hand.some((c) => c.suit === leadSuit);

  if (hasLeadSuit && card.suit !== leadSuit) {
    return {
      valid: false,
      message: `You must follow suit (${leadSuit})`,
    };
  }

  // trumpSuit is accepted for future rule variants (e.g. must-trump)
  void trumpSuit;

  return { valid: true };
}

/**
 * Highest trump wins if any trump is present; otherwise highest lead-suit card.
 */
export function calculateTrickWinner(trick, leadSuit, trumpSuit) {
  if (!trick || trick.length === 0) {
    throw new Error('Cannot calculate winner of an empty trick');
  }

  const trumpCards = trick.filter((play) => play.card.suit === trumpSuit);

  if (trumpCards.length > 0) {
    return trumpCards.reduce((best, play) =>
      getCardValue(play.card) > getCardValue(best.card) ? play : best
    );
  }

  const leadSuitCards = trick.filter((play) => play.card.suit === leadSuit);

  return leadSuitCards.reduce((best, play) =>
    getCardValue(play.card) > getCardValue(best.card) ? play : best
  );
}

/**
 * Count tens (mendi) in a trick.
 */
export function countTensInTrick(trick) {
  return trick.filter((play) => play.card.rank === '10').length;
}

/**
 * Authentic Mendikot scoring:
 * - Team with 3 or 4 tens wins the round
 * - If tens split 2-2, team with 7+ tricks wins
 * - All 4 tens = Mendikot
 * - All 4 tens + all 13 tricks = Whitewash / 52-card Mendikot
 */
export function calculateRoundResult(teamScores) {
  const teamATens = teamScores[TEAM_A].tens;
  const teamBTens = teamScores[TEAM_B].tens;
  const teamATricks = teamScores[TEAM_A].tricks;
  const teamBTricks = teamScores[TEAM_B].tricks;

  let winningTeam = null;
  let resultType = 'normal';
  let message = '';

  if (teamATens >= 3) {
    winningTeam = TEAM_A;
  } else if (teamBTens >= 3) {
    winningTeam = TEAM_B;
  } else if (teamATens === 2 && teamBTens === 2) {
    if (teamATricks >= 7) {
      winningTeam = TEAM_A;
    } else if (teamBTricks >= 7) {
      winningTeam = TEAM_B;
    }
  }

  if (winningTeam !== null) {
    const tens = teamScores[winningTeam].tens;
    const tricks = teamScores[winningTeam].tricks;

    if (tens === 4 && tricks === TOTAL_TRICKS) {
      resultType = 'whitewash';
      message = 'Whitewash! All four tens and all 13 tricks!';
    } else if (tens === 4) {
      resultType = 'mendikot';
      message = 'Mendikot! All four tens captured!';
    } else if (tens >= 3) {
      resultType = 'tens';
      message = `Won with ${tens} tens`;
    } else {
      resultType = 'tricks';
      message = `Tens tied 2-2 — won with ${tricks} tricks`;
    }
  } else {
    message = 'Round ended in a draw';
  }

  return {
    winningTeam,
    resultType,
    message,
    teamScores: {
      [TEAM_A]: { ...teamScores[TEAM_A] },
      [TEAM_B]: { ...teamScores[TEAM_B] },
    },
  };
}

/**
 * Returns playable card IDs for the current player (for UI highlighting).
 */
export function getPlayableCardIds(player, currentTrick) {
  if (!player || currentTrick.length === 0) {
    return player.hand.map((card) => card.id);
  }

  const leadSuit = currentTrick[0].card.suit;
  const leadSuitCards = player.hand.filter((card) => card.suit === leadSuit);

  if (leadSuitCards.length > 0) {
    return leadSuitCards.map((card) => card.id);
  }

  return player.hand.map((card) => card.id);
}
