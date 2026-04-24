function formatUserRow(row, works = []) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phoneNumber: row.phone_number,
    maskedPhoneNumber: row.masked_phone_number,
    avatarKey: row.avatar_key,
    gender: row.gender,
    birthYear: row.birth_year,
    birthMonth: row.birth_month,
    city: row.city,
    signature: row.signature,
    introVideoTitle: row.intro_video_title,
    introVideoSummary: row.intro_video_summary,
    phoneStatus: row.phone_status,
    identityStatus: row.identity_status,
    faceStatus: row.face_status,
    legalName: row.legal_name,
    maskedIdNumber: row.masked_id_number,
    faceMatchScore: row.face_match_score,
    phoneVerifiedAt: row.phone_verified_at,
    identityVerifiedAt: row.identity_verified_at,
    faceVerifiedAt: row.face_verified_at,
    membershipLevel: row.membership_level,
    isOnline: Boolean(row.is_online),
    activityScore: row.activity_score,
    phoneVerified: row.phone_status === 'verified',
    identityVerified: row.identity_status === 'verified',
    faceVerified: row.face_status === 'verified',
    works,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatWorkRow(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    summary: row.summary,
    mediaUrl: row.media_url,
    duration: row.duration,
    isPinned: Boolean(row.is_pinned),
    reviewStatus: row.review_status,
    createdAt: row.created_at,
  };
}

function formatConversationRow(row) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    categoryLabel: row.category_label,
    segment: row.segment,
    lastMessagePreview: row.last_message_preview || '',
    unreadCount: row.unread_count || 0,
    isPinned: Boolean(row.is_pinned),
    isOnline: Boolean(row.is_online),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatMessageRow(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    text: row.text,
    type: row.type,
    deliveryStatus: row.delivery_status,
    mediaUrl: row.media_url,
    metadataLabel: row.metadata_label,
    isRecalled: Boolean(row.is_recalled),
    createdAt: row.created_at,
  };
}

function maskPhoneNumber(value) {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length < 7) {
    return digits;
  }
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function maskIdNumber(value) {
  const normalized = (value || '').trim().toUpperCase();
  if (normalized.length < 8) {
    return normalized;
  }
  return `${normalized.slice(0, 4)}********${normalized.slice(-4)}`;
}

module.exports = {
  formatConversationRow,
  formatMessageRow,
  formatUserRow,
  formatWorkRow,
  maskIdNumber,
  maskPhoneNumber,
};
