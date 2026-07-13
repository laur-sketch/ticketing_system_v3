"""Rename a MySQL database by moving all tables. Usage: python rename-hris-db.py hris-demo hris-dev"""
import os
import subprocess
import sys

MYSQL = r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
ENV = {**os.environ, "MYSQL_PWD": "root"}
BASE = ["-u", "root", "-h", "localhost", "-P", "3306"]


def run(sql: str) -> None:
    subprocess.run([MYSQL, *BASE, "-e", sql], env=ENV, check=True)


def rename_db(source: str, target: str) -> None:
    out = subprocess.check_output(
        [
            MYSQL,
            *BASE,
            "-N",
            "-e",
            f"""
            SELECT CONCAT(
              '`{source}`.`', table_name,
              '` TO `{target}`.`', table_name, '`'
            )
            FROM information_schema.tables
            WHERE table_schema = '{source}' AND table_type = 'BASE TABLE'
            ORDER BY table_name;
            """,
        ],
        env=ENV,
        text=True,
    ).strip()

    renames = [line for line in out.splitlines() if line.strip()]
    if not renames:
        raise SystemExit(f"No tables found in `{source}`.")

    print(f"Moving {len(renames)} tables from `{source}` to `{target}`…")

    run(
        f"CREATE DATABASE IF NOT EXISTS `{target}` "
        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    )

    batch_size = 40
    for i in range(0, len(renames), batch_size):
        chunk = renames[i : i + batch_size]
        run("RENAME TABLE " + ", ".join(chunk) + ";")

    run(f"DROP DATABASE `{source}`")

    count = subprocess.check_output(
        [
            MYSQL,
            *BASE,
            "-N",
            "-e",
            f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='{target}'",
        ],
        env=ENV,
        text=True,
    ).strip()
    print(f"Done. `{target}` has {count} tables.")


def main() -> None:
    source = sys.argv[1] if len(sys.argv) > 1 else "hris-demo"
    target = sys.argv[2] if len(sys.argv) > 2 else "hris-dev"
    rename_db(source, target)


if __name__ == "__main__":
    main()
