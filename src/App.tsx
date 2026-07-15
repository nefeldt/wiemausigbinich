import {
  faFileImport,
  faGear,
  faPlus,
  faPrint,
  faTrashCan,
  faWandMagicSparkles,
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
  useOverlayController,
} from "@mittwald/flow-react-components";
import { useCallback, useEffect, useState } from "react";
import {
  addPerson,
  deletePerson,
  getConfig,
  getPeople,
  setDeletePassword,
} from "./api";
import { QuizModal } from "./components/QuizModal";
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
  const [deleteRequiresPassword, setDeleteRequiresPassword] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [newDeletePassword, setNewDeletePassword] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const quizController = useOverlayController("Modal");
  const deleteController = useOverlayController("Modal", {
    onClose: () => {
      setPendingDelete(null);
      setPassword("");
      setDeleteError(null);
    },
  });
  const adminController = useOverlayController("Modal", {
    onClose: () => {
      setAdminPassword("");
      setAdminError(null);
    },
  });

  const refresh = useCallback(async () => {
    try {
      setPeople(await getPeople());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load people.");
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
    getConfig()
      .then((config) => setDeleteRequiresPassword(config.deleteRequiresPassword))
      .catch(() => {
        // keep the default; deleting will still fail server-side if protected
      });
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
    deleteController.open();
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deletePerson(pendingDelete.id, password);
      await refresh();
      setNotice(`Removed ${pendingDelete.name} from the triangle.`);
      deleteController.close();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Deleting failed.");
    } finally {
      setDeleting(false);
    }
  };

  const handleAdminSave = async () => {
    setAdminError(null);
    setAdminSaving(true);
    try {
      const config = await setDeletePassword(adminPassword, newDeletePassword);
      setDeleteRequiresPassword(config.deleteRequiresPassword);
      setNewDeletePassword("");
      adminController.close();
      setNotice(
        config.deleteRequiresPassword
          ? "Delete protection is now enabled."
          : "Delete protection is now disabled.",
      );
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Saving failed.");
    } finally {
      setAdminSaving(false);
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
        <div className="afm-header__row">
          <Heading size="xl">Atzig - Fotzig - Mausig</Heading>
          <Button
            variant="plain"
            color="secondary"
            aria-label="Admin settings"
            onPress={() => {
              setAdminError(null);
              adminController.open();
            }}
          >
            <Icon>
              <FontAwesomeIcon icon={faGear} />
            </Icon>
          </Button>
        </div>
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

              <Button
                color="accent"
                variant="soft"
                onPress={() => {
                  setError(null);
                  setNotice(null);
                  quizController.open();
                }}
              >
                <Icon>
                  <FontAwesomeIcon icon={faWandMagicSparkles} />
                </Icon>
                Take the AI quiz
              </Button>

              <Separator />

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

      <QuizModal
        controller={quizController}
        defaultName={name}
        onSave={async (quizName, result) => {
          await addPerson(quizName, result);
          await refresh();
          setScores(result);
          setName("");
          setNotice(`Added ${quizName}! ${formatPercentages(result)}`);
        }}
        onDiscard={(result) => {
          setScores(result);
          setNotice(
            `Quiz result applied to the sliders (not saved): ${formatPercentages(result)}`,
          );
        }}
      />

      <Modal controller={deleteController} isDismissable showCloseButton>
        <Heading>Delete {pendingDelete?.name}?</Heading>
        <Content>
          {deleteError && (
            <Alert status="danger">
              <Content>{deleteError}</Content>
            </Alert>
          )}
          {deleteRequiresPassword ? (
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
          ) : (
            <Text>This removes {pendingDelete?.name} from the triangle.</Text>
          )}
        </Content>
        <ActionGroup>
          <Button
            variant="soft"
            color="secondary"
            onPress={() => deleteController.close()}
          >
            Cancel
          </Button>
          <Button
            color="danger"
            onPress={() => void handleDelete()}
            isPending={deleting}
            isDisabled={deleteRequiresPassword && !password}
          >
            <Icon>
              <FontAwesomeIcon icon={faTrashCan} />
            </Icon>
            Delete
          </Button>
        </ActionGroup>
      </Modal>

      <Modal controller={adminController} isDismissable showCloseButton>
        <Heading>Admin settings</Heading>
        <Content>
          {adminError && (
            <Alert status="danger">
              <Content>{adminError}</Content>
            </Alert>
          )}
          <TextField
            type="password"
            value={adminPassword}
            onChange={setAdminPassword}
          >
            <Label>Admin password</Label>
            <FieldDescription>
              The APP_PASSWORD configured through the deploy pipeline.
            </FieldDescription>
          </TextField>
          <TextField
            type="password"
            value={newDeletePassword}
            onChange={setNewDeletePassword}
          >
            <Label optional={false}>Delete password</Label>
            <FieldDescription>
              People can only be deleted with this password. Leave empty to
              allow deleting without a password (default). Takes effect
              immediately.
            </FieldDescription>
          </TextField>
        </Content>
        <ActionGroup>
          <Button
            variant="soft"
            color="secondary"
            onPress={() => adminController.close()}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            onPress={() => void handleAdminSave()}
            isPending={adminSaving}
          >
            Save
          </Button>
        </ActionGroup>
      </Modal>
    </div>
  );
}
