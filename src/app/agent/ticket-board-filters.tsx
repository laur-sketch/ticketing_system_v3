"use client";

type TicketBoardCompanySelectProps = {
  name?: string;
  defaultValue: string;
  options: Array<{ id: string; name: string }>;
  className?: string;
};

/** Resets assignee when company changes so stale agent ids are not submitted. */
export function TicketBoardCompanySelect({
  name = "company",
  defaultValue,
  options,
  className,
}: TicketBoardCompanySelectProps) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className={className}
      onChange={(event) => {
        const form = event.currentTarget.form;
        const assigned = form?.querySelector<HTMLSelectElement>('select[name="assigned"]');
        if (assigned) assigned.value = "ALL";
      }}
    >
      <option value="ALL">All companies</option>
      {options.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </select>
  );
}
