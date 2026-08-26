import Header from "../../components/Header/index.js";
import UserProfile from "../../components/UserProfile/index.js";

// Who somebody is, at /<name>: a person is a thing worth a URL, which is what
// makes them shareable, bookmarkable, and openable in a tab of their own from the
// list of people nearby. Every name in lo comes here — this is the whole of what
// lo has to say about somebody, and the only place it says it.
export default function UserPage({ username }) {
  return (
    <div className="page-shell">
      <Header back cards />
      <main className="form-page">
        {/* The account page's column, and deliberately not its card: what is on
            that page is a record and a form, and the rules it draws its own list
            of pairs with would rule the contact rows a second time. */}
        <section className="profile-card">
          <UserProfile key={username} username={username} />
        </section>
      </main>
    </div>
  );
}
