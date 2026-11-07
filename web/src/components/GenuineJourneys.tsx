import { genuineJourneys } from "./genuineJourneys";
import { Icon } from "./common";

export function GenuineJourneys() {
  return (
    <section className="genuine-journeys" aria-label="Genuine payment examples">
      <h2>Inspect two genuine payment outcomes</h2>
      <ul>
        {genuineJourneys.map((journey) => (
          <li key={journey.id}>
            <a href={journey.href}>
              {journey.label}
              <Icon name="arrow" size={16} />
            </a>
          </li>
        ))}
      </ul>
      <p>
        No wallet needed. Both are controlled Base Sepolia tests with real
        receipts. No physical delivery occurred.
      </p>
    </section>
  );
}
