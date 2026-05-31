import { apiFetch } from './client';

// First-time enable: parent sets a 4-6 digit PIN and optionally seeds
// the initial child profiles. After this the parent is in "parent view"
// (activeStudentId = null) and can manage things from /parent.
export const setupParentMode = (pin, students = []) =>
  apiFetch('/api/parent/setup', {
    method: 'POST',
    body: JSON.stringify({ pin, students }),
  });

// Verify the PIN. Used by the unlock screen on /parent and by exit-child.
export const verifyPin = (pin) =>
  apiFetch('/api/parent/verify-pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });

export const getParentStatus = () => apiFetch('/api/parent/status');

// Add a child profile (PIN-gated).
export const addStudent = (pin, { name, color, grade }) =>
  apiFetch('/api/parent/students', {
    method: 'POST',
    body: JSON.stringify({ pin, name, color, grade }),
  });

// Remove a child profile. PIN goes in the x-parent-pin header so the body
// can stay JSON-clean for the DELETE request.
export const removeStudent = (pin, sid) =>
  apiFetch(`/api/parent/students/${sid}`, {
    method: 'DELETE',
    headers: { 'x-parent-pin': String(pin || '') },
  });

// Switch the active child profile. No PIN required - kids should be able
// to swap freely. Going BACK to parent view requires PIN (see exitChild).
export const switchToStudent = (sid) =>
  apiFetch(`/api/parent/students/${sid}/switch`, { method: 'POST' });

// Select the parent admin profile from the ProfilePicker. When parent
// mode is enabled the server REQUIRES the PIN - otherwise a kid could
// just click the admin tile to escape restrictions. On a fresh account
// (parent mode never set up) the server returns `requiresSetup: true`
// and the caller should route to the setup form.
export const selectAdmin = (pin) =>
  apiFetch('/api/parent/select-admin', {
    method: 'POST',
    body: JSON.stringify({ pin: pin ?? '' }),
  });

// Rotate the parent PIN. Takes the CURRENT pin to authenticate plus the
// new one (4-6 digits).
export const changePin = (oldPin, newPin) =>
  apiFetch('/api/parent/change-pin', {
    method: 'POST',
    body: JSON.stringify({ oldPin, newPin }),
  });

// Turn parent mode off entirely. Wipes PIN + students + active selection.
// Curricula stay (they just stop being scoped per child).
export const disableParentMode = (pin) =>
  apiFetch('/api/parent/disable', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });

// Aggregate activity feed across all children - newest 30 events
// (curricula created, lessons completed, assignments graded, study
// sessions). PIN-gated.
export const getParentActivity = (pin) =>
  apiFetch('/api/parent/activity', {
    headers: { 'x-parent-pin': String(pin || '') },
  });

export const exitChild = (pin) =>
  apiFetch('/api/parent/exit-child', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });

// Adult family member management
export const addAdult = (pin, { name, color }) =>
  apiFetch('/api/parent/adults', {
    method: 'POST',
    body: JSON.stringify({ pin, name, color }),
  });

export const removeAdult = (pin, aid) =>
  apiFetch(`/api/parent/adults/${aid}`, {
    method: 'DELETE',
    headers: { 'x-parent-pin': String(pin || '') },
  });

export const switchToAdult = (aid) =>
  apiFetch(`/api/parent/adults/${aid}/switch`, { method: 'POST' });

export const exitAdult = () =>
  apiFetch('/api/parent/exit-adult', { method: 'POST' });

// Parental dashboard: returns each student with summary stats
// (total courses, completion, avg grade, recent assignments).
export const getParentDashboard = () => apiFetch('/api/parent/dashboard');

// Update a child's parental controls (blockedApps, requireGraded,
// difficultyFloor, allowChats). PIN-gated.
export const updateStudentControls = (pin, sid, controls) =>
  apiFetch(`/api/parent/students/${sid}/controls`, {
    method: 'PUT',
    body: JSON.stringify({ pin, controls }),
  });

// List a child's chat history (lesson chats + study sessions). PIN goes
// in a header so it doesn't end up in URLs or logs.
export const listStudentChats = (pin, sid) =>
  apiFetch(`/api/parent/students/${sid}/chats`, {
    headers: { 'x-parent-pin': String(pin || '') },
  });

// Full transcript for one chat. `kind` is 'lesson' or 'study'.
// For lessons, `chatId` is the composite "<curriculumId>::<lessonId>".
// For study, `chatId` is the session id.
export const getStudentChat = (pin, sid, kind, chatId) =>
  apiFetch(`/api/parent/students/${sid}/chats/${kind}/${encodeURIComponent(chatId)}`, {
    headers: { 'x-parent-pin': String(pin || '') },
  });
