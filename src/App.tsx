import {
  faFileImport,
  faPlus,
  faPrint,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ActionGroup,
  Alert,
  Button,
  Content,
  FieldDescription,
  Heading,
  Icon,
  Label,
  LayoutCard,
  Link,
  LoadingSpinner,
  Modal,
  Section,
  Separator,
  Slider,
  Text,
  TextField,
} from "@mittwald/flow-react-components";
import { useCallback, useEffect, useState } from "react";
import { addPerson, deletePerson, getPeople } from "./api";
import { TernaryChart } from "./components/TernaryChart";
import { exportTrianglePdf } from "./pdf";
import { formatPercentages, parseResultInput, personColor } from "./ternary";
import type { Person, Scores } from "./types";

const DEFAULT_SCORES: Scores = { m: 5, a: 5, f: 5 };

export function App() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scores, setScores] = useState<Scores>(DEFAULT_SCORES);
  const [importUrl, setImportUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Person | null>(null);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPeople(await getPeople());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load people.");
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const setScore = (key: keyof Scores) => (value: number | number[]) => {
    const num = Array.isArray(value) ? value[0] : value;
    setScores((prev) => ({ ...prev, [key]: num }));
  };

  const requireName = (): string | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name first.");
      return null;
    }
    return trimmed;
  };

  const handleAdd = async () => {
    setError(null);
    setNotice(null);
    const trimmedName = requireName();
    if (!trimmedName) return;
    setSaving(true);
    try {
      await addPerson(trimmedName, scores);
      await refresh();
      setName("");
      setNotice(`Added ${trimmedName}! ${formatPercentages(scores)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving failed.");
    } finally {
      setSaving(false);
    }
  };

  // Importing adds the person straight to the triangle, so it needs a name too
  const handleImport = async () => {
    setError(null);
    setNotice(null);
    const trimmedName = requireName();
    if (!trimmedName) return;
    const parsed = parseResultInput(importUrl);
    if (!parsed) {
      setError(
        "Could not read m/a/f from that input. Expected something like " +
          "https://atzigfotzigmausig.de/result?m=4&a=2.8&f=6.2",
      );
      return;
    }
    setImporting(true);
    try {
      await addPerson(trimmedName, parsed);
      await refresh();
      setScores(parsed);
      setImportUrl("");
      setName("");
      setNotice(
        `Added ${trimmedName} from atzigfotzigmausig.de! ${formatPercentages(parsed)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const openDeleteDialog = (person: Person) => {
    setError(null);
    setNotice(null);
    setDeleteError(null);
    setPassword("");
    setPendingDelete(person);
  };

  const closeDeleteDialog = () => {
    setPendingDelete(null);
    setPassword("");
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deletePerson(pendingDelete.id, password);
      await refresh();
      setNotice(`Removed ${pendingDelete.name} from the triangle.`);
      closeDeleteDialog();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Deleting failed.");
    } finally {
      setDeleting(false);
    }
  };

  const handleExportPdf = async () => {
    setError(null);
    setNotice(null);
    setExporting(true);
    try {
      await exportTrianglePdf(people);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF export failed.");
    } finally {
      setExporting(false);
    }
  };

  const preview = { name, scores };

  return (
    <div className="afm-page">
      <header className="afm-header">
        <Heading size="xl">Atzig - Fotzig - Mausig</Heading>
        <Text>
          where does your team stand? Add yourself or import your result from{" "}
          <Link href="https://atzigfotzigmausig.de" target="_blank">
            atzigfotzigmausig.de
          </Link>
          .
        </Text>
      </header>

      {error && (
        <Alert status="danger">
          <Heading>That didn't work</Heading>
          <Content>{error}</Content>
        </Alert>
      )}
      {notice && !error && (
        <Alert status="success">
          <Heading>Done</Heading>
          <Content>{notice}</Content>
        </Alert>
      )}

      {loading && (
        <div className="afm-loading">
          <LoadingSpinner size="l" />
        </div>
      )}

      <div className="afm-columns" hidden={loading}>
        <LayoutCard>
          <Section>
            <div className="afm-card-head">
              <Button
                className="afm-print-button"
                variant="soft"
                color="secondary"
                onPress={() => void handleExportPdf()}
                isPending={exporting}
              >
                <Icon>
                  <FontAwesomeIcon icon={faPrint} />
                </Icon>
                Print triangle (PDF)
              </Button>
            </div>
            <TernaryChart people={people} preview={preview} />
          </Section>
        </LayoutCard>

        <div className="afm-sidebar">
          <LayoutCard>
            <Section>
              <Heading>Add yourself</Heading>

              <TextField
                value={name}
                onChange={setName}
                maxLength={40}
                isRequired
              >
                <Label>Name</Label>
              </TextField>

              <TextField
                value={importUrl}
                onChange={setImportUrl}
                placeholder="https://atzigfotzigmausig.de/result?m=4&a=2.8&f=6.2"
              >
                <Label>Import a result URL</Label>
                <FieldDescription>
                  Paste your atzigfotzigmausig.de result link — it goes straight
                  into the triangle.
                </FieldDescription>
              </TextField>
              <Button
                variant="soft"
                color="secondary"
                onPress={() => void handleImport()}
                isDisabled={!importUrl.trim()}
                isPending={importing}
              >
                <Icon>
                  <FontAwesomeIcon icon={faFileImport} />
                </Icon>
                Import &amp; add
              </Button>

              <Separator />

              <Slider
                value={scores.m}
                onChange={setScore("m")}
                minValue={0}
                maxValue={10}
                step={0.1}
              >
                <Label optional={false}>🍷 mausig</Label>
              </Slider>
              <Slider
                value={scores.a}
                onChange={setScore("a")}
                minValue={0}
                maxValue={10}
                step={0.1}
              >
                <Label optional={false}>🚬 atzig</Label>
              </Slider>
              <Slider
                value={scores.f}
                onChange={setScore("f")}
                minValue={0}
                maxValue={10}
                step={0.1}
              >
                <Label optional={false}>🫦 fotzig</Label>
              </Slider>

              <Text className="afm-percentages">
                {formatPercentages(scores)}
              </Text>

              <Button
                color="primary"
                onPress={() => void handleAdd()}
                isPending={saving}
              >
                <Icon>
                  <FontAwesomeIcon icon={faPlus} />
                </Icon>
                Add to triangle
              </Button>
            </Section>
          </LayoutCard>

          <LayoutCard>
            <Section>
              <Heading>People ({people.length})</Heading>
              {people.length === 0 && (
                <Text>Nobody here yet — be the first!</Text>
              )}
              <ul className="afm-people">
                {people.map((person) => (
                  <li key={person.id} className="afm-person">
                    <span
                      className="afm-person__dot"
                      style={{ background: personColor(person.id) }}
                    />
                    <span className="afm-person__info">
                      <Text>{person.name}</Text>
                      <FieldDescription>
                        {formatPercentages(person)}
                      </FieldDescription>
                    </span>
                    <Button
                      variant="plain"
                      color="danger"
                      aria-label={`Delete ${person.name}`}
                      onPress={() => openDeleteDialog(person)}
                    >
                      <Icon>
                        <FontAwesomeIcon icon={faTrashCan} />
                      </Icon>
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          </LayoutCard>
        </div>
      </div>

      <Modal
        isOpen={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
        isDismissable
      >
        <Heading>Delete {pendingDelete?.name}?</Heading>
        <Content>
          {deleteError && (
            <Alert status="danger">
              <Content>{deleteError}</Content>
            </Alert>
          )}
          <TextField
            type="password"
            value={password}
            onChange={setPassword}
            isRequired
          >
            <Label>Password</Label>
            <FieldDescription>
              Removing someone from the triangle requires the team password.
            </FieldDescription>
          </TextField>
        </Content>
        <ActionGroup>
          <Button variant="soft" color="secondary" onPress={closeDeleteDialog}>
            Cancel
          </Button>
          <Button
            color="danger"
            onPress={() => void handleDelete()}
            isPending={deleting}
            isDisabled={!password}
          >
            <Icon>
              <FontAwesomeIcon icon={faTrashCan} />
            </Icon>
            Delete
          </Button>
        </ActionGroup>
      </Modal>
    </div>
  );
}
