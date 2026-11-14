# Animated Fashion AI Landing + Login

Run `npm install` and `npm run dev`. Visit http://localhost:5173/.

- `/`: public scroll-controlled 249-frame landing page. Top-right Login opens a popup.
- Login submits username/password to existing `POST /api/designs/management/login`.
- `/portal`: original HomePage dress catalog, unchanged. Existing routes are guarded by a session-expiry-aware frontend wrapper.
- Logout clears the browser session and returns to `/`.
- The credentials are the **existing COLLECTION_ADMIN_USERNAME / COLLECTION_ADMIN_PASSWORD_HASH** configured in backend `.env`; no customer accounts were created.

IMPORTANT LIMITATIONS
- This reuses administrator authentication for a working login demonstration. It is NOT client login, tenant isolation, or production-grade session security.
- Backend public APIs and static image URLs remain accessible directly, as in the original application. The frontend route guard DOES NOT secure backend resources.
- Before deploying as a multi-client service, implement account tables, secure HttpOnly cookie sessions or equivalent server-side validation, backend authorization for every API/image request, and trusted schema-per-client routing.
- Original backend project is unchanged.
