import { useTranslation } from "react-i18next";
import { Select } from "../../ui/index.js";
import { SORTS } from "../../utils/sort.js";
import styles from "./sort.module.css";

// The handle beside the search box, and the second half of what that box does:
// one narrows the list, the other decides what the top of it is. The same
// control over both lists, for the reason the field is the same over both — a
// mark and a post are the same row asking two questions, and neither ordering
// them nor searching them should be two different gestures.
//
// The house menu rather than a button that cycles: three answers behind one word
// is a control a reader has to press twice to find out what it holds, and the
// one they want is as likely to be the one they have just passed.
//
// `near` is whether the reader's position is known. Where it is not — the marks
// list arrives from the server and does not wait on the browser's answer about
// where its reader is standing — there is no nearest, so the menu does not offer
// one rather than offering a row that would do nothing.
export default function SortField({ value, onChange, near = true }) {
  const { t } = useTranslation();

  const options = SORTS.filter((sort) => near || sort !== "nearest").map((sort) => ({
    value: sort,
    label: t(`sort.${sort}`),
  }));

  return (
    <Select
      className={styles.field}
      options={options}
      value={value}
      onChange={onChange}
      // The box shows the answer and not the question — "Latest", not "Sort by:
      // Latest" — because the row it stands in is a search field and a handle,
      // and a label written into it would be the widest thing on that row. What
      // the handle is for is said to a reader who cannot see it instead.
      label={t("sort.label")}
    />
  );
}
